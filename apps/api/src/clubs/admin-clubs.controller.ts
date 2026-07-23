import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ClubsService } from './clubs.service';
import { ListClubsQueryDto } from './dto/club.dto';

// Validation des demandes de club. Réservé au SUPER_ADMIN (pas d'UI au MVP :
// le back-office web est post-MVP, ces routes servent d'API d'administration).
@Roles(UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/clubs', version: '1' })
export class AdminClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Get()
  list(@Query() query: ListClubsQueryDto) {
    return this.clubs.listClubs(query.status);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.clubs.decide(id, true);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.clubs.decide(id, false);
  }
}
