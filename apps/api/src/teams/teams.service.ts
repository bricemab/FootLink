import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Club, ClubMember, ClubMemberRole, Gender, Team } from '@prisma/client';
import { ClubContext, ClubsService } from '../clubs/clubs.service';
import { CoachesService, CoachView } from '../clubs/coaches.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/team.dto';

// Contexte d'accès à une équipe, résolu côté serveur à partir du token.
export interface TeamAccess {
  club: Club;
  member: ClubMember;
  team: Team;
}

/** Ce qu'une suppression d'équipe emporterait avec elle. */
export interface TeamDeletionImpact {
  teamId: string;
  teamName: string | null;
  listings: number;
  applications: number;
  clubInterests: number;
  matches: number;
  conversations: number;
  messages: number;
  coachAssignments: number;
  /** Vrai si la suppression ne détruit rien d'autre que l'équipe elle-même. */
  isEmpty: boolean;
}

export const CONFIRMATION_REQUIRED_CODE = 'TEAM_DELETION_CONFIRMATION_REQUIRED';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
    private readonly coaches: CoachesService,
  ) {}

  // CLUB_ADMIN : toutes les équipes du club (il bascule en Vue Entraîneur sur
  // n'importe laquelle). COACH : uniquement celles qui lui sont assignées.
  async listMyTeams(userId: string) {
    const { club, member } = await this.clubs.getMyClubContext(userId, false);
    return this.prisma.team.findMany({
      where:
        member.role === ClubMemberRole.CLUB_ADMIN
          ? { clubId: club.id }
          : { clubId: club.id, coaches: { some: { clubMemberId: member.id } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        coaches: {
          include: {
            clubMember: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: { select: { id: true, email: true } },
              },
            },
          },
        },
        _count: { select: { listings: true } },
      },
    });
  }

  async getTeam(userId: string, teamId: string) {
    const { team } = await this.assertTeamAccess(userId, teamId);
    return this.prisma.team.findUniqueOrThrow({
      where: { id: team.id },
      include: {
        coaches: {
          include: {
            clubMember: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: { select: { id: true, email: true } },
              },
            },
          },
        },
        _count: { select: { listings: true } },
      },
    });
  }

  /**
   * Crée une équipe, et optionnellement l'entraîneur qui la prend en charge.
   *
   * Les deux sont écrits dans la MÊME transaction : une équipe orpheline créée
   * parce que l'invitation a échoué serait une incohérence visible côté club.
   * L'email part après le commit — un SMTP lent n'a pas à tenir un verrou.
   */
  async createTeam(userId: string, dto: CreateTeamDto): Promise<{ team: Team; coach: CoachView | null }> {
    const { club } = await this.assertClubAdmin(userId);
    const gender = dto.gender ?? Gender.MALE;
    const name = dto.name?.trim() || null;

    await this.assertNoDuplicate(club.id, dto.category, gender, name);

    // Validation de l'entraîneur AVANT la transaction : si l'email est déjà
    // membre du club, on refuse sans avoir rien créé.
    const prepared = dto.coach ? await this.coaches.prepareCoach(club.id, dto.coach) : null;

    const { team, coachMemberId } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: { clubId: club.id, category: dto.category, gender, name },
      });
      if (!prepared) {
        return { team: created, coachMemberId: null };
      }
      const member = await this.coaches.persistCoach(tx, club.id, prepared, [created.id]);
      return { team: created, coachMemberId: member.id };
    });

    if (prepared && coachMemberId) {
      const member = await this.prisma.clubMember.findUniqueOrThrow({
        where: { id: coachMemberId },
        select: { userId: true },
      });
      await this.coaches.deliverInvite(club, prepared, member.userId);
      return { team, coach: await this.coaches.viewOf(coachMemberId) };
    }
    return { team, coach: null };
  }

  async updateTeam(userId: string, teamId: string, dto: UpdateTeamDto): Promise<Team> {
    const { club } = await this.assertClubAdmin(userId);
    const team = await this.findTeamOfClub(club.id, teamId);

    const category = dto.category ?? team.category;
    const gender = dto.gender ?? team.gender;
    const name = dto.name === undefined ? team.name : dto.name.trim() || null;

    await this.assertNoDuplicate(club.id, category, gender, name, team.id);

    return this.prisma.team.update({
      where: { id: team.id },
      data: { category, gender, name },
    });
  }

  /**
   * Décompte exact de ce qu'une suppression détruirait. C'est ce que l'app
   * affiche dans son alerte : « supprimer cette équipe » doit être une phrase
   * chiffrée, pas une formule vague.
   */
  async getDeletionImpact(userId: string, teamId: string): Promise<TeamDeletionImpact> {
    const { club } = await this.assertClubAdmin(userId);
    const team = await this.findTeamOfClub(club.id, teamId);
    return this.computeImpact(team);
  }

  /**
   * Supprime l'équipe ET tout ce qui en dépend : annonces, candidatures,
   * intérêts club, matchs, conversations et messages (cascade en base).
   *
   * Irréversible, donc jamais implicite : sans `confirmed`, on refuse et on
   * renvoie le décompte, pour que le client n'ait aucun moyen d'appeler cette
   * route sans avoir de quoi afficher l'alerte.
   */
  async deleteTeam(userId: string, teamId: string, confirmed: boolean): Promise<void> {
    const { club } = await this.assertClubAdmin(userId);
    const team = await this.findTeamOfClub(club.id, teamId);
    const impact = await this.computeImpact(team);

    if (!confirmed && !impact.isEmpty) {
      throw new ConflictException({
        code: CONFIRMATION_REQUIRED_CODE,
        message:
          'Deleting this team also deletes its listings, applications, matches and conversations. Retry with confirm=true.',
        impact,
      });
    }

    await this.prisma.team.delete({ where: { id: team.id } });
  }

  // Garde d'accès réutilisable (annonces, recrutement, messagerie des phases suivantes).
  // CLUB_ADMIN = toutes les équipes de SON club ; COACH = ses équipes assignées.
  async assertTeamAccess(userId: string, teamId: string): Promise<TeamAccess> {
    const { club, member } = await this.clubs.getMyClubContext(userId);
    const team = await this.findTeamOfClub(club.id, teamId);
    if (member.role === ClubMemberRole.COACH) {
      const assignment = await this.prisma.coachTeamAssignment.findUnique({
        where: { clubMemberId_teamId: { clubMemberId: member.id, teamId: team.id } },
      });
      if (!assignment) {
        throw new ForbiddenException('This team is not assigned to you.');
      }
    }
    return { club, member, team };
  }

  private async computeImpact(team: Team): Promise<TeamDeletionImpact> {
    const listingFilter = { listing: { teamId: team.id } };
    const [listings, applications, clubInterests, matches, conversations, messages, coachAssignments] =
      await Promise.all([
        this.prisma.listing.count({ where: { teamId: team.id } }),
        this.prisma.playerInterest.count({ where: listingFilter }),
        this.prisma.clubInterest.count({ where: listingFilter }),
        this.prisma.match.count({ where: listingFilter }),
        this.prisma.conversation.count({ where: { match: listingFilter } }),
        this.prisma.message.count({ where: { conversation: { match: listingFilter } } }),
        this.prisma.coachTeamAssignment.count({ where: { teamId: team.id } }),
      ]);

    return {
      teamId: team.id,
      teamName: team.name,
      listings,
      applications,
      clubInterests,
      matches,
      conversations,
      messages,
      coachAssignments,
      // Les assignations d'entraîneur ne comptent pas : elles se refont en un clic.
      isEmpty:
        listings === 0 &&
        applications === 0 &&
        clubInterests === 0 &&
        matches === 0 &&
        conversations === 0 &&
        messages === 0,
    };
  }

  private async assertNoDuplicate(
    clubId: string,
    category: Team['category'],
    gender: Gender,
    name: string | null,
    exceptTeamId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.team.findFirst({
      where: {
        clubId,
        category,
        gender,
        name,
        ...(exceptTeamId ? { id: { not: exceptTeamId } } : {}),
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'A team with this category, gender and name already exists in your club.',
      );
    }
  }

  private async assertClubAdmin(userId: string): Promise<ClubContext> {
    const context = await this.clubs.getMyClubContext(userId);
    if (context.member.role !== ClubMemberRole.CLUB_ADMIN) {
      throw new ForbiddenException('Restricted to the club administrator.');
    }
    return context;
  }

  // Recherche systématiquement bornée au club du demandeur : une équipe d'un
  // autre club est indistinguable d'une équipe inexistante.
  private async findTeamOfClub(clubId: string, teamId: string): Promise<Team> {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, clubId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }
    return team;
  }
}
