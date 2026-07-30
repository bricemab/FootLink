import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { MediaModule } from '../media/media.module';
import { TeamsModule } from '../teams/teams.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [TeamsModule, ClubsModule, MediaModule],
  controllers: [FeedController],
  providers: [FeedService],
  // Exporte pour que la liste des annonces puisse afficher combien de joueurs
  // correspondent : la regle de correspondance reste ici, a un seul endroit.
  exports: [FeedService],
})
export class FeedModule {}
