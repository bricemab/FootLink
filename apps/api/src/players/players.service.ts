import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getSeasonStartYear,
  isAgeAllowed,
  isMinorForSeason,
  MIN_PLAYER_AGE,
} from '@footlink/shared';
import { Prisma } from '@prisma/client';
import { GeoService } from '../geo/geo.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPlayerProfileDto } from './dto/upsert-player-profile.dto';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  getMyProfile(userId: string) {
    return this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { positions: true },
    });
  }

  async upsertMyProfile(userId: string, dto: UpsertPlayerProfileDto) {
    const seasonStartYear = getSeasonStartYear(new Date());

    // Garde d'âge : MVP réservé aux 16 ans et plus.
    if (!isAgeAllowed(dto.birthYear, seasonStartYear)) {
      throw new BadRequestException(`Inscription réservée aux ${MIN_PLAYER_AGE} ans et plus.`);
    }

    // Exactement une position principale.
    if (dto.positions.filter((p) => p.isPrimary).length !== 1) {
      throw new BadRequestException('Exactement une position principale est requise.');
    }
    // Pas de poste en double.
    if (new Set(dto.positions.map((p) => p.poste)).size !== dto.positions.length) {
      throw new BadRequestException('Un même poste ne peut pas être répété.');
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
      currentClubName: dto.currentClubName ?? null,
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
      },
      update: {
        ...common,
        // On remplace intégralement les positions.
        positions: { deleteMany: {}, create: positionsCreate },
      },
      include: { positions: true },
    });
  }
}
