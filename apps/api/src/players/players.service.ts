import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getSeasonStartYear,
  isAgeAllowed,
  isMinorForSeason,
  MIN_PLAYER_AGE,
} from '@footlink/shared';
import { ClubStatus, Prisma } from '@prisma/client';
import { GeoService } from '../geo/geo.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPlayerProfileDto } from './dto/upsert-player-profile.dto';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly media: MediaService,
  ) {}

  /**
   * Profil du joueur connecté, avec l'URL SIGNEE de sa photo.
   *
   * La photo vit sur `User.avatarKey` et non sur le profil : elle appartient à
   * la personne, pas à son rôle de joueur. On ne renvoie jamais la clé de
   * stockage — seulement une URL de lecture courte, comme pour le logo de club.
   */
  async getMyProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: {
        positions: true,
        currentClub: { select: { id: true, name: true } },
        user: { select: { avatarKey: true } },
      },
    });
    if (!profile) {
      return null;
    }
    // `user` est retiré de la réponse : il ne portait que la clé de stockage,
    // qui n'a rien à faire côté client.
    const { user, ...rest } = profile;
    return { ...rest, avatarUrl: await this.media.readUrl(user.avatarKey) };
  }

  async upsertMyProfile(userId: string, dto: UpsertPlayerProfileDto) {
    const seasonStartYear = getSeasonStartYear(new Date());

    // Garde d'âge : MVP réservé aux 16 ans et plus.
    if (!isAgeAllowed(dto.birthYear, seasonStartYear)) {
      throw new BadRequestException(
        `Registration is restricted to players aged ${MIN_PLAYER_AGE} and over.`,
      );
    }

    // Exactement une position principale.
    if (dto.positions.filter((p) => p.isPrimary).length !== 1) {
      throw new BadRequestException('Exactly one primary position is required.');
    }
    // Pas de poste en double.
    if (new Set(dto.positions.map((p) => p.poste)).size !== dto.positions.length) {
      throw new BadRequestException('A position cannot be listed twice.');
    }

    // Club actuel : lien DÉCLARATIF vers un club validé. Ne crée AUCUN ClubMember
    // et n'accorde aucun droit sur ce club.
    let linkedClub: { id: string; name: string } | null = null;
    if (dto.currentClubId) {
      const club = await this.prisma.club.findFirst({
        where: { id: dto.currentClubId, status: ClubStatus.APPROVED },
        select: { id: true, name: true },
      });
      if (!club) {
        throw new BadRequestException('Club not found or not approved.');
      }
      linkedClub = club;
    }

    const isMinor = isMinorForSeason(dto.birthYear, seasonStartYear);
    const rounded =
      dto.lat !== undefined && dto.lng !== undefined
        ? this.geo.roundToGrid({ lat: dto.lat, lng: dto.lng })
        : null;

    const common = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      birthYear: dto.birthYear,
      gender: dto.gender,
      isMinor,
      heightCm: dto.heightCm ?? null,
      strongFoot: dto.strongFoot ?? null,
      bio: dto.bio ?? null,
      currentCategory: dto.currentCategory ?? null,
      currentClubName: linkedClub ? linkedClub.name : (dto.currentClubName ?? null),
      hideCurrentClub: dto.hideCurrentClub ?? false,
      isSeekingClub: dto.isSeekingClub ?? true,
      isVisible: dto.isVisible ?? true,
      canton: dto.canton ?? null,
      locality: dto.locality ?? null,
      lat: rounded ? new Prisma.Decimal(rounded.lat) : null,
      lng: rounded ? new Prisma.Decimal(rounded.lng) : null,
    } satisfies Prisma.PlayerProfileUpdateInput;

    const positionsCreate = dto.positions.map((p) => ({
      poste: p.poste,
      isPrimary: p.isPrimary ?? false,
    }));

    return this.prisma.playerProfile.upsert({
      where: { userId },
      create: {
        ...common,
        user: { connect: { id: userId } },
        positions: { create: positionsCreate },
        ...(linkedClub ? { currentClub: { connect: { id: linkedClub.id } } } : {}),
      },
      update: {
        ...common,
        // On remplace intégralement les positions.
        positions: { deleteMany: {}, create: positionsCreate },
        currentClub: linkedClub ? { connect: { id: linkedClub.id } } : { disconnect: true },
      },
      include: {
        positions: true,
        currentClub: { select: { id: true, name: true } },
      },
    });
  }
}
