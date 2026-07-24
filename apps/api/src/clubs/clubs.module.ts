import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeoModule } from '../geo/geo.module';
import { MailModule } from '../mail/mail.module';
import { AdminClubsController } from './admin-clubs.controller';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [AuthModule, GeoModule, MailModule],
  controllers: [ClubsController, CoachesController, AdminClubsController, RegionsController],
  providers: [ClubsService, CoachesService],
  exports: [ClubsService],
})
export class ClubsModule {}
