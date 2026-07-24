import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Club, ClubMember, ClubMemberRole, Gender, Team } from '@prisma/client';
import { ClubContext, ClubsService } from '../clubs/clubs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/team.dto';

// Contexte d'accès à une équipe, résolu côté serveur à partir du token.
export interface TeamAccess {
  club: Club;
  member: ClubMember;
  team: Team;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
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
            clubMember: { include: { user: { select: { id: true, email: true } } } },
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
            clubMember: { include: { user: { select: { id: true, email: true } } } },
          },
        },
        _count: { select: { listings: true } },
      },
    });
  }

  async createTeam(userId: string, dto: CreateTeamDto): Promise<Team> {
    const { club } = await this.assertClubAdmin(userId);
    const gender = dto.gender ?? Gender.MALE;
    const name = dto.name ?? null;

    const duplicate = await this.prisma.team.findFirst({
      where: { clubId: club.id, category: dto.category, gender, name },
    });
    if (duplicate) {
      throw new ConflictException(
        'A team with this category, gender and name already exists in your club.',
      );
    }

    return this.prisma.team.create({
      data: { clubId: club.id, category: dto.category, gender, name },
    });
  }

  async updateTeam(userId: string, teamId: string, dto: UpdateTeamDto): Promise<Team> {
    const { club } = await this.assertClubAdmin(userId);
    const team = await this.findTeamOfClub(club.id, teamId);

    const category = dto.category ?? team.category;
    const gender = dto.gender ?? team.gender;
    const name = dto.name === undefined ? team.name : (dto.name || null);

    const duplicate = await this.prisma.team.findFirst({
      where: { clubId: club.id, category, gender, name, id: { not: team.id } },
    });
    if (duplicate) {
      throw new ConflictException(
        'A team with this category, gender and name already exists in your club.',
      );
    }

    return this.prisma.team.update({
      where: { id: team.id },
      data: { category, gender, name },
    });
  }

  // Supprimer une équipe supprimerait en cascade ses annonces, donc les
  // candidatures, matchs et conversations rattachés. On refuse tant qu'il reste
  // des annonces : au club de les clôturer explicitement d'abord.
  async deleteTeam(userId: string, teamId: string): Promise<void> {
    const { club } = await this.assertClubAdmin(userId);
    const team = await this.findTeamOfClub(club.id, teamId);
    const listings = await this.prisma.listing.count({ where: { teamId: team.id } });
    if (listings > 0) {
      throw new BadRequestException(
        'This team still has listings. Close or delete them before deleting the team.',
      );
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
