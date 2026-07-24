import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Club, ClubMember, ClubMemberRole, ClubStatus, Prisma, UserRole } from '@prisma/client';
import { GeoService } from '../geo/geo.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestClubDto, UpdateClubDto } from './dto/club.dto';

export interface ClubContext {
  club: Club;
  member: ClubMember;
}

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly geo: GeoService,
  ) {}

  /**
   * Demande de compte club, par un utilisateur **déjà authentifié**.
   *
   * L'identité est prouvée en amont — code à 6 chiffres reçu par email, ou
   * Google — avant qu'on crée quoi que ce soit. Le club naît en PENDING et ne
   * peut rien publier tant qu'un SUPER_ADMIN ne l'a pas validé.
   */
  async requestClub(
    userId: string,
    dto: RequestClubDto,
  ): Promise<{ club: { id: string; name: string; status: ClubStatus } }> {
    const alreadyMember = await this.prisma.clubMember.findFirst({ where: { userId } });
    if (alreadyMember) {
      throw new ConflictException('This account is already linked to a club.');
    }
    await this.assertRegionExists(dto.regionCode);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const club = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club.create({
        data: {
          name: dto.clubName,
          status: ClubStatus.PENDING,
          contactEmail: dto.contactEmail?.toLowerCase() ?? user.email,
          requestNote: dto.requestNote ?? null,
          regionCode: dto.regionCode ?? null,
          canton: dto.canton ?? null,
          locality: dto.locality ?? null,
          members: {
            create: { userId, role: ClubMemberRole.CLUB_ADMIN, isOwner: true },
          },
        },
      });
      // Le rôle principal suit l'activité réelle du compte. Les droits sur le
      // club viennent du ClubMember : un joueur devenu responsable garde donc
      // son profil joueur intact.
      await tx.user.update({ where: { id: userId }, data: { role: UserRole.CLUB_ADMIN } });
      return created;
    });

    return { club: { id: club.id, name: club.name, status: club.status } };
  }

  // --- Côté club (le clubId n'est JAMAIS pris du client : anti-IDOR) ---
  async getMyClub(userId: string) {
    const member = await this.prisma.clubMember.findFirst({
      where: { userId },
      include: { club: { include: { region: true } } },
    });
    if (!member) {
      return null;
    }
    return {
      club: member.club,
      membership: { role: member.role, isOwner: member.isOwner },
      canOperate: member.club.status === ClubStatus.APPROVED,
    };
  }

  // Contexte club de l'utilisateur authentifié. requireApproved = garde d'accès
  // AGENTS §4bis : rien de publiable tant que le club n'est pas APPROVED.
  async getMyClubContext(userId: string, requireApproved = true): Promise<ClubContext> {
    const member = await this.prisma.clubMember.findFirst({
      where: { userId },
      include: { club: true },
    });
    if (!member) {
      throw new ForbiddenException('No club is linked to this account.');
    }
    if (requireApproved && member.club.status !== ClubStatus.APPROVED) {
      throw new ForbiddenException('The club must be approved before performing this action.');
    }
    return { club: member.club, member };
  }

  async updateMyClub(userId: string, dto: UpdateClubDto) {
    const { club, member } = await this.getMyClubContext(userId, false);
    if (member.role !== ClubMemberRole.CLUB_ADMIN) {
      throw new ForbiddenException('Restricted to the club administrator.');
    }
    await this.assertRegionExists(dto.regionCode);

    const rounded =
      dto.lat !== undefined && dto.lng !== undefined
        ? this.geo.roundToGrid({ lat: dto.lat, lng: dto.lng })
        : null;

    return this.prisma.club.update({
      where: { id: club.id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        contactEmail: dto.contactEmail?.toLowerCase() ?? undefined,
        regionCode: dto.regionCode ?? undefined,
        canton: dto.canton ?? undefined,
        locality: dto.locality ?? undefined,
        ...(rounded
          ? { lat: new Prisma.Decimal(rounded.lat), lng: new Prisma.Decimal(rounded.lng) }
          : {}),
      },
      include: { region: true },
    });
  }

  // Liste des clubs sélectionnables par un joueur (club actuel). Lien DÉCLARATIF :
  // sélectionner un club ne crée AUCUN ClubMember et aucun droit.
  listSelectableClubs(search?: string) {
    return this.prisma.club.findMany({
      where: {
        status: ClubStatus.APPROVED,
        ...(search ? { name: { contains: search } } : {}),
      },
      select: {
        id: true,
        name: true,
        canton: true,
        locality: true,
        logoUrl: true,
        regionCode: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  listRegions() {
    return this.prisma.region.findMany({ orderBy: { labelFr: 'asc' } });
  }

  // --- SUPER_ADMIN ---
  listClubs(status?: ClubStatus) {
    return this.prisma.club.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        region: true,
        members: {
          include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
        },
      },
    });
  }

  async decide(clubId: string, approved: boolean): Promise<Club> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: { members: { include: { user: true } } },
    });
    if (!club) {
      throw new NotFoundException('Club not found.');
    }
    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        status: approved ? ClubStatus.APPROVED : ClubStatus.REJECTED,
        reviewedAt: new Date(),
      },
    });
    const owner = club.members.find((m) => m.isOwner)?.user;
    if (owner) {
      await this.mail.sendClubDecisionEmail(owner.email, club.name, approved, owner.locale);
    }
    return updated;
  }

  private async assertRegionExists(regionCode?: string): Promise<void> {
    if (!regionCode) {
      return;
    }
    const region = await this.prisma.region.findUnique({ where: { code: regionCode } });
    if (!region) {
      throw new BadRequestException('Unknown region (association).');
    }
  }
}
