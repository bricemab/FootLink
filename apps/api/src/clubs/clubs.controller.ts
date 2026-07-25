import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ClubsService } from './clubs.service';
import type { UploadTicket } from '../media/media.service';
import {
  ClubLogoUploadDto,
  ConfirmClubLogoDto,
  RequestClubDto,
  SearchClubsQueryDto,
  UpdateClubDto,
} from './dto/club.dto';

@Controller({ path: 'clubs', version: '1' })
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  // Demande de compte club -> Club PENDING (validation SUPER_ADMIN requise).
  // Authentifié : l'identité du demandeur est prouvée avant qu'on crée le club.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('requests')
  request(@CurrentUser('userId') userId: string, @Body() dto: RequestClubDto) {
    return this.clubs.requestClub(userId, dto);
  }

  // Liste des clubs sélectionnables (ex. "mon club actuel" côté joueur).
  // Lien déclaratif : ne donne AUCUN droit sur le club.
  @Get()
  list(@Query() query: SearchClubsQueryDto) {
    return this.clubs.listSelectableClubs(query.search);
  }

  @Get('me')
  getMine(@CurrentUser('userId') userId: string) {
    return this.clubs.getMyClub(userId);
  }

  @Patch('me')
  updateMine(@CurrentUser('userId') userId: string, @Body() dto: UpdateClubDto) {
    return this.clubs.updateMyClub(userId, dto);
  }

  /**
   * Logo du club. Trois endpoints comme pour l'avatar : le mobile televerse
   * directement vers le stockage avec une URL pre-signee, puis confirme.
   *
   * Ils vivent dans le module clubs et non dans le module media, parce qu'ils
   * doivent verifier que l'appelant est bien CLUB_ADMIN de SON club -- ce que
   * seul `ClubsService` sait faire. Y mettre `ClubsService` dans le module media
   * creerait un cycle (media <- auth <- clubs).
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/logo/upload-url')
  createLogoUpload(
    @CurrentUser('userId') userId: string,
    @Body() dto: ClubLogoUploadDto,
  ): Promise<UploadTicket> {
    return this.clubs.createLogoUpload(userId, dto.contentType);
  }

  @Post('me/logo/confirm')
  confirmLogo(@CurrentUser('userId') userId: string, @Body() dto: ConfirmClubLogoDto) {
    return this.clubs.confirmLogo(userId, dto.key);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me/logo')
  async removeLogo(@CurrentUser('userId') userId: string): Promise<void> {
    await this.clubs.removeLogo(userId);
  }
}
