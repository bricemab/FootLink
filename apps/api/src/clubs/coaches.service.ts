import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Club,
  ClubMember,
  ClubMemberRole,
  Locale,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
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

@Injectable()
export class CoachesService {
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

    await this.deliverInvite(club, prepared, member.userId);
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
    const code = await this.auth.createCoachInviteCode(user.id);
    await this.mail.sendCoachInviteEmail(
      user.email,
      member.firstName ?? '',
      club.name,
      code,
      user.locale,
    );
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
      teams: member.teamAssignments.map((assignment) => assignment.team),
      createdAt: member.user.createdAt.toISOString(),
    };
  }
}
