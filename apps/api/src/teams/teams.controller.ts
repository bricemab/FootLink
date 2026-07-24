import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTeamDto, UpdateTeamDto } from './dto/team.dto';
import { TeamsService } from './teams.service';

@Controller({ path: 'teams', version: '1' })
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  // Sélecteur d'équipe active côté app : la liste dépend du rôle dans le club.
  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.teams.listMyTeams(userId);
  }

  @Get(':id')
  getOne(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.teams.getTeam(userId, id);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTeamDto) {
    return this.teams.createTeam(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teams.updateTeam(userId, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.teams.deleteTeam(userId, id);
  }
}
