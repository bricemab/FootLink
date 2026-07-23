import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpsertPlayerProfileDto } from './dto/upsert-player-profile.dto';
import { PlayersService } from './players.service';

// Un utilisateur gère UNIQUEMENT son propre profil (userId issu du token, jamais du body).
@Controller({ path: 'players', version: '1' })
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get('me')
  getMe(@CurrentUser('userId') userId: string) {
    return this.players.getMyProfile(userId);
  }

  @Put('me')
  upsertMe(@CurrentUser('userId') userId: string, @Body() dto: UpsertPlayerProfileDto) {
    return this.players.upsertMyProfile(userId, dto);
  }
}
