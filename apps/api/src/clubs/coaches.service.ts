import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Club,
  ClubMember,
  ClubMemberRole,
  Locale,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { TokenType } from '@prisma/client';
import { normalizeEmail } from '@footlink/shared';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClubContext, ClubsService } from './clubs.service';
import { CoachIdentityDto, CreateCoachDto, SetCoachTeamsDto } from './dto/coach.dto';

// Vue exposée d'un entraîneur. `hasAccepted` remplace toute exposition du hash :
// le mot de passe ne sort jamais du service, même sous forme dérivée.
export interface CoachView {
  clubMemberId: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: Locale;
  hasAccepted: boolean;
  emailVerified: boolean;
  /** Null tant que l'envoi n'a pas abouti — il part apres la reponse HTTP. */
  inviteSentAt: string | null;
  /** Renseigne quand le dernier envoi a echoue : le club doit pouvoir reessayer. */
  inviteFailedAt: string | null;
  teams: { id: string; name: string | null; category: string; gender: string }[];
  createdAt: string;
}

/**
 * Un entraîneur prêt à être écrit en base : toutes les vérifications sont
 * faites, il ne reste que les écritures. Permet de créer une équipe ET son
 * entraîneur dans une seule transaction (cf. TeamsService), sans dupliquer les
 * règles de validation.
 */
export interface PreparedCoach {
  identity: CoachIdentityDto;
  email: string;
  locale: Locale;
  existingUser: User | null;
  /** Un compte sans mot de passe ET sans Google ne peut pas se connecter. */
  needsInvite: boolean;
}

/**
 * Plafond d'invitations pour UN entraineur.
 *
 * Compte **tous** les emails d'invitation partis vers cette adresse dans la
 * fenetre, creation du compte comprise : l'objectif est de ne pas inonder une
 * boite, pas de compter des clics. Un club qui cree un entraineur peut donc lui
 * renvoyer un code deux fois de suite, puis doit attendre.
 *
 * ⚠️ C'est une limite **par entraineur**, distincte du rate-limit par IP du
 * `ThrottlerGuard`. Les deux sont necessaires : le throttle protege le serveur,
 * celui-ci protege le destinataire — un club avec vingt entraineurs passerait
 * sous le throttle tout en spammant une seule adresse.
 */
export const COACH_INVITE_WINDOW_MINUTES = 30;
export const COACH_INVITE_MAX_PER_WINDOW = 3;
export const COACH_INVITE_RATE_LIMITED = 'COACH_INVITE_RATE_LIMITED';

@Injectable()
export class CoachesService {
  private readonly logger = new Logger(CoachesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  async listCoaches(userId: string): Promise<CoachView[]> {
    const { club } = await this.assertClubAdmin(userId);
    const members = await this.prisma.clubMember.findMany({
      where: { clubId: club.id, role: ClubMemberRole.COACH },
      include: { user: true, teamAssignments: { include: { team: true } } },
    });
    return members.map((member) => this.toView(member));
  }

  async createCoach(userId: string, dto: CreateCoachDto): Promise<CoachView> {
    const { club } = await this.assertClubAdmin(userId);
    const teamIds = await this.assertTeamsBelongToClub(club.id, dto.teamIds ?? []);
    const prepared = await this.prepareCoach(club.id, dto);

    const member = await this.prisma.$transaction((tx) =>
      this.persistCoach(tx, club.id, prepared, teamIds),
    );

    // 🔴 **On n'ATTEND PAS l'email.** Un envoi SMTP prend 30 a 85 s sur le reseau
    // de Brice (mesure : 84 s pour un message, quel que soit le port ou le
    // pool). Le tenir dans la requete HTTP faisait fixer un spinner pendant une
    // minute et demie, et rendait l'endpoint otage de la lenteur du fournisseur.
    this.deliverInviteInBackground(club, prepared, member.userId, member.id);
    return this.loadView(member.id);
  }

  // --- Réutilisable par TeamsService (création équipe + entraîneur) ---------

  /** Valide l'entraîneur sans rien écrire. À appeler AVANT d'ouvrir la transaction. */
  async prepareCoach(clubId: string, identity: CoachIdentityDto): Promise<PreparedCoach> {
    // Ce service écrit en base sans passer par UsersService (la création vit
    // dans une transaction partagée avec l'équipe) : la normalisation doit
    // donc être faite ici aussi, sinon un club pourrait créer un doublon de
    // compte entraîneur avec `prenom+club@gmail.com`.
    const email = normalizeEmail(identity.email);
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const alreadyMember = await this.prisma.clubMember.findUnique({
        where: { clubId_userId: { clubId, userId: existingUser.id } },
      });
      if (alreadyMember) {
        throw new ConflictException('This user is already a member of your club.');
      }
    }

    return {
      identity,
      email,
      locale: identity.locale ?? existingUser?.locale ?? Locale.FR,
      existingUser,
      needsInvite: !existingUser || (!existingUser.passwordHash && !existingUser.googleId),
    };
  }

  /** Écritures seules — s'exécute dans la transaction de l'appelant. */
  async persistCoach(
    tx: Prisma.TransactionClient,
    clubId: string,
    prepared: PreparedCoach,
    teamIds: string[],
  ): Promise<ClubMember> {
    const user =
      prepared.existingUser ??
      (await tx.user.create({
        data: { email: prepared.email, role: UserRole.COACH, locale: prepared.locale },
      }));

    const member = await tx.clubMember.create({
      data: {
        clubId,
        userId: user.id,
        role: ClubMemberRole.COACH,
        firstName: prepared.identity.firstName.trim(),
        lastName: prepared.identity.lastName.trim(),
      },
    });

    if (teamIds.length > 0) {
      await tx.coachTeamAssignment.createMany({
        data: teamIds.map((teamId) => ({ clubMemberId: member.id, teamId })),
      });
    }
    return member;
  }

  /** Envoi d'email — hors transaction : un SMTP lent ne doit pas tenir un verrou. */
  async deliverInvite(club: Club, prepared: PreparedCoach, userId: string): Promise<void> {
    const displayName = prepared.identity.firstName.trim();
    if (prepared.needsInvite) {
      const code = await this.auth.createCoachInviteCode(userId);
      await this.mail.sendCoachInviteEmail(
        prepared.email,
        displayName,
        club.name,
        code,
        prepared.locale,
      );
      return;
    }
    await this.mail.sendCoachAddedEmail(prepared.email, displayName, club.name, prepared.locale);
  }

  async viewOf(clubMemberId: string): Promise<CoachView> {
    return this.loadView(clubMemberId);
  }

  // --- Gestion courante ----------------------------------------------------

  // Renvoie une invitation (email perdu, jeton expiré).
  async resendInvite(userId: string, clubMemberId: string): Promise<void> {
    const { club } = await this.assertClubAdmin(userId);
    const member = await this.findCoachOfClub(club.id, clubMemberId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    if (user.passwordHash || user.googleId) {
      throw new BadRequestException('This coach has already activated their account.');
    }
    /*
     * Plafond d'envois AVANT de creer quoi que ce soit : emettre le jeton puis
     * refuser l'envoi invaliderait le code precedent sans en delivrer de
     * nouveau, et l'entraineur se retrouverait avec un code mort.
     */
    const since = new Date(Date.now() - COACH_INVITE_WINDOW_MINUTES * 60 * 1000);
    const recent = await this.prisma.token.count({
      where: { userId: user.id, type: TokenType.COACH_INVITE, createdAt: { gte: since } },
    });
    if (recent >= COACH_INVITE_MAX_PER_WINDOW) {
      throw new HttpException(
        {
          code: COACH_INVITE_RATE_LIMITED,
          message: `Too many invitations sent. Try again in ${COACH_INVITE_WINDOW_MINUTES} minutes.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Le jeton est cree TOUT DE SUITE et de facon synchrone : c'est lui qui
    // invalide le precedent, et le club doit pouvoir compter dessus des que
    // l'API a repondu. Seul l'envoi part en arriere-plan.
    const code = await this.auth.createCoachInviteCode(user.id);
    this.sendInBackground(member.id, () =>
      this.mail.sendCoachInviteEmail(
        user.email,
        member.firstName ?? '',
        club.name,
        code,
        user.locale,
      ),
    );
  }

  /**
   * Invitation envoyee APRES la reponse HTTP, avec son resultat inscrit en base.
   *
   * ⚠️ Le jeton d'invitation est cree ICI et non dans la requete : il depend du
   * chemin (nouveau compte ou compte existant), et `deliverInvite` portait deja
   * cette logique. Consequence acceptee : entre la reponse et la fin de l'envoi,
   * le code n'existe pas encore. C'est sans effet visible — personne ne peut
   * saisir un code qu'il n'a pas encore recu.
   */
  private deliverInviteInBackground(
    club: Club,
    prepared: PreparedCoach,
    userId: string,
    clubMemberId: string,
  ): void {
    this.sendInBackground(clubMemberId, () => this.deliverInvite(club, prepared, userId));
  }

  /**
   * 🔴 **Le seul endroit ou un echec d'envoi est rattrape.**
   *
   * Detacher l'envoi de la requete rend son echec MUET : plus personne ne recoit
   * de 500, et le club croirait son entraineur invite. C'est le defaut que
   * l'audit reprochait au repli SMTP (#2), on ne le recree pas ici. L'issue est
   * donc horodatee en base et remontee dans la fiche de l'entraineur.
   *
   * `void` assume : la promesse n'est jamais attendue, et elle ne peut pas
   * rejeter — tout est capture.
   */
  private sendInBackground(clubMemberId: string, send: () => Promise<void>): void {
    void send()
      .then(async () => {
        await this.prisma.clubMember.update({
          where: { id: clubMemberId },
          data: { inviteSentAt: new Date(), inviteFailedAt: null },
        });
      })
      .catch(async (error: unknown) => {
        // Le detail SMTP reste ICI, dans les logs serveur : il peut contenir
        // l'adresse du relais et des messages de diagnostic, qui n'ont rien a
        // faire dans une reponse d'API.
        this.logger.error(
          `Echec d'envoi de l'invitation (clubMember ${clubMemberId})`,
          error instanceof Error ? error.stack : undefined,
        );
        await this.prisma.clubMember
          .update({ where: { id: clubMemberId }, data: { inviteFailedAt: new Date() } })
          // Si meme cette ecriture echoue, il ne reste que le log — mais laisser
          // rejeter une promesse detachee tuerait le processus.
          .catch(() => undefined);
      });
  }

  async setCoachTeams(
    userId: string,
    clubMemberId: string,
    dto: SetCoachTeamsDto,
  ): Promise<CoachView> {
    const { club } = await this.assertClubAdmin(userId);
    const member = await this.findCoachOfClub(club.id, clubMemberId);
    const teamIds = await this.assertTeamsBelongToClub(club.id, dto.teamIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.coachTeamAssignment.deleteMany({ where: { clubMemberId: member.id } });
      if (teamIds.length > 0) {
        await tx.coachTeamAssignment.createMany({
          data: teamIds.map((teamId) => ({ clubMemberId: member.id, teamId })),
        });
      }
    });

    return this.loadView(member.id);
  }

  // Retire l'entraîneur du club. Ses sessions sont révoquées immédiatement :
  // sans ça, son access token courant continuerait de passer les gardes.
  async removeCoach(userId: string, clubMemberId: string): Promise<void> {
    const { club } = await this.assertClubAdmin(userId);
    const member = await this.findCoachOfClub(club.id, clubMemberId);

    await this.prisma.$transaction(async (tx) => {
      await tx.clubMember.delete({ where: { id: member.id } });
      await tx.refreshToken.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Le compte n'existait que pour ce club (créé par lui, sans profil joueur
      // ni autre club) : on le supprime réellement. Sinon on ne touche pas au
      // compte, qui garde sa vie propre côté joueur ou autre club.
      const [user, otherMemberships, playerProfile] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: member.userId } }),
        tx.clubMember.count({ where: { userId: member.userId } }),
        tx.playerProfile.findUnique({
          where: { userId: member.userId },
          select: { id: true },
        }),
      ]);
      if (user.role === UserRole.COACH && otherMemberships === 0 && !playerProfile) {
        await tx.user.delete({ where: { id: member.userId } });
      }
    });
  }

  async assertClubAdmin(userId: string): Promise<ClubContext> {
    const context = await this.clubs.getMyClubContext(userId);
    if (context.member.role !== ClubMemberRole.CLUB_ADMIN) {
      throw new ForbiddenException('Restricted to the club administrator.');
    }
    return context;
  }

  // Recherche bornée au club du demandeur : un membre d'un autre club est
  // indistinguable d'un membre inexistant (anti-IDOR, pas d'énumération).
  private async findCoachOfClub(clubId: string, clubMemberId: string): Promise<ClubMember> {
    const member = await this.prisma.clubMember.findFirst({
      where: { id: clubMemberId, clubId, role: ClubMemberRole.COACH },
    });
    if (!member) {
      throw new NotFoundException('Coach not found.');
    }
    return member;
  }

  private async assertTeamsBelongToClub(clubId: string, teamIds: string[]): Promise<string[]> {
    const unique = [...new Set(teamIds)];
    if (unique.length === 0) {
      return [];
    }
    const found = await this.prisma.team.count({ where: { id: { in: unique }, clubId } });
    if (found !== unique.length) {
      throw new BadRequestException('One or more teams do not belong to your club.');
    }
    return unique;
  }

  private async loadView(clubMemberId: string): Promise<CoachView> {
    const member = await this.prisma.clubMember.findUniqueOrThrow({
      where: { id: clubMemberId },
      include: { user: true, teamAssignments: { include: { team: true } } },
    });
    return this.toView(member);
  }

  private toView(member: {
    id: string;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    inviteSentAt: Date | null;
    inviteFailedAt: Date | null;
    user: {
      email: string;
      locale: Locale;
      passwordHash: string | null;
      googleId: string | null;
      emailVerifiedAt: Date | null;
      createdAt: Date;
    };
    teamAssignments: { team: { id: string; name: string | null; category: string; gender: string } }[];
  }): CoachView {
    return {
      clubMemberId: member.id,
      userId: member.userId,
      email: member.user.email,
      firstName: member.firstName,
      lastName: member.lastName,
      locale: member.user.locale,
      hasAccepted: member.user.passwordHash !== null || member.user.googleId !== null,
      emailVerified: member.user.emailVerifiedAt !== null,
      inviteSentAt: member.inviteSentAt?.toISOString() ?? null,
      inviteFailedAt: member.inviteFailedAt?.toISOString() ?? null,
      teams: member.teamAssignments.map((assignment) => assignment.team),
      createdAt: member.user.createdAt.toISOString(),
    };
  }
}
