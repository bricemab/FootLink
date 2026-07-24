import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CoachesService, CoachView } from './coaches.service';
import { CreateCoachDto, SetCoachTeamsDto } from './dto/coach.dto';

// Gestion des comptes entraîneurs. Le club est TOUJOURS dérivé du token, et le
// droit vient du ClubMember.role (pas du User.role) : un joueur qui est aussi
// responsable de club garde ses droits club.
@Controller({ path: 'clubs/me/coaches', version: '1' })
export class CoachesController {
  constructor(private readonly coaches: CoachesService) {}

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<CoachView[]> {
    return this.coaches.listCoaches(userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateCoachDto): Promise<CoachView> {
    return this.coaches.createCoach(userId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':clubMemberId/invite')
  async resendInvite(
    @CurrentUser('userId') userId: string,
    @Param('clubMemberId') clubMemberId: string,
  ): Promise<void> {
    await this.coaches.resendInvite(userId, clubMemberId);
  }

  @Put(':clubMemberId/teams')
  setTeams(
    @CurrentUser('userId') userId: string,
    @Param('clubMemberId') clubMemberId: string,
    @Body() dto: SetCoachTeamsDto,
  ): Promise<CoachView> {
    return this.coaches.setCoachTeams(userId, clubMemberId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':clubMemberId')
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('clubMemberId') clubMemberId: string,
  ): Promise<void> {
    await this.coaches.removeCoach(userId, clubMemberId);
  }
}
