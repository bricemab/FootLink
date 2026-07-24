import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [ClubsModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  // assertTeamAccess sera réutilisé par listings / interactions / messaging.
  exports: [TeamsService],
})
export class TeamsModule {}
