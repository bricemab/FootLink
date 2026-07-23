import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeoModule } from '../geo/geo.module';
import { MailModule } from '../mail/mail.module';
import { AdminClubsController } from './admin-clubs.controller';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [AuthModule, GeoModule, MailModule],
  controllers: [ClubsController, AdminClubsController, RegionsController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
