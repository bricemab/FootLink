import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubMember, ClubMemberRole, Locale, UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClubContext, ClubsService } from './clubs.service';
import { CreateCoachDto, SetCoachTeamsDto } from './dto/coach.dto';

// Vue exposée d'un entraîneur. `hasAccepted` remplace toute exposition du hash :
// le mot de passe ne sort jamais du service, même sous forme dérivée.
export interface CoachView {
  clubMemberId: string;
  userId: string;
  email: string;
  locale: Locale;
  hasAccepted: boolean;
  emailVerified: boolean;
  teams: { id: string; name: string | null; category: string; gender: string }[];
  createdAt: string;
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
      include: {
        user: true,
        teamAssignments: { include: { team: true } },
      },
    });
    return members.map((member) => this.toView(member));
  }

  async createCoach(userId: string, dto: CreateCoachDto): Promise<CoachView> {
    const { club } = await this.assertClubAdmin(userId);
    const email = dto.email.toLowerCase();
    const teamIds = await this.assertTeamsBelongToClub(club.id, dto.teamIds ?? []);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      const alreadyMember = await this.prisma.clubMember.findUnique({
        where: { clubId_userId: { clubId: club.id, userId: existing.id } },
      });
      if (alreadyMember) {
        throw new ConflictException('This user is already a member of your club.');
      }
    }

    // Un compte sans mot de passe ET sans Google ne peut pas se connecter :
    // c'est exactement le cas qui nécessite une invitation.
    const needsInvite = !existing || (!existing.passwordHash && !existing.googleId);
    const locale = dto.locale ?? existing?.locale ?? Locale.FR;

    const member = await this.prisma.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: { email, role: UserRole.COACH, locale },
        }));
      const created = await tx.clubMember.create({
        data: { clubId: club.id, userId: user.id, role: ClubMemberRole.COACH },
      });
      if (teamIds.length > 0) {
        await tx.coachTeamAssignment.createMany({
          data: teamIds.map((teamId) => ({ clubMemberId: created.id, teamId })),
        });
      }
      return created;
    });

    if (needsInvite) {
      const token = await this.auth.createCoachInviteToken(member.userId);
      await this.mail.sendCoachInviteEmail(email, club.name, token, locale);
    } else {
      await this.mail.sendCoachAddedEmail(email, club.name, locale);
    }

    return this.loadView(member.id);
  }

  // Renvoie une invitation (email perdu, jeton expiré).
  async resendInvite(userId: string, clubMemberId: string): Promise<void> {
    const { club } = await this.assertClubAdmin(userId);
    const member = await this.findCoachOfClub(club.id, clubMemberId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    if (user.passwordHash || user.googleId) {
      throw new BadRequestException('This coach has already activated their account.');
    }
    const token = await this.auth.createCoachInviteToken(user.id);
    await this.mail.sendCoachInviteEmail(user.email, club.name, token, user.locale);
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

  private async assertClubAdmin(userId: string): Promise<ClubContext> {
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
    user: { email: string; locale: Locale; passwordHash: string | null; googleId: string | null; emailVerifiedAt: Date | null; createdAt: Date };
    teamAssignments: { team: { id: string; name: string | null; category: string; gender: string } }[];
  }): CoachView {
    return {
      clubMemberId: member.id,
      userId: member.userId,
      email: member.user.email,
      locale: member.user.locale,
      hasAccepted: member.user.passwordHash !== null || member.user.googleId !== null,
      emailVerified: member.user.emailVerifiedAt !== null,
      teams: member.teamAssignments.map((assignment) => assignment.team),
      createdAt: member.user.createdAt.toISOString(),
    };
  }
}
