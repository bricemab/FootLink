import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ClubsService } from './clubs.service';
import { RequestClubDto, SearchClubsQueryDto, UpdateClubDto } from './dto/club.dto';

@Controller({ path: 'clubs', version: '1' })
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  // Public : demande de compte club -> Club PENDING (validation SUPER_ADMIN requise).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('requests')
  request(@Body() dto: RequestClubDto) {
    return this.clubs.requestClub(dto);
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
}
