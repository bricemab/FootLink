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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTeamDto, DeleteTeamQueryDto, UpdateTeamDto } from './dto/team.dto';
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

  // Ce que la suppression détruirait — de quoi alimenter l'alerte côté app.
  @Get(':id/deletion-impact')
  deletionImpact(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.teams.getDeletionImpact(userId, id);
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

  // Suppression en cascade. Sans `?confirm=true`, l'API refuse et renvoie le
  // décompte : impossible de supprimer sans avoir de quoi prévenir l'utilisateur.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query() query: DeleteTeamQueryDto,
  ): Promise<void> {
    await this.teams.deleteTeam(userId, id, query.confirm === true);
  }
}
