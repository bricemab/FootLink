import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { TeamsModule } from '../teams/teams.module';
import { ListingsController } from './listings.controller';
import { ListingsScheduler } from './listings.scheduler';
import { ListingsService } from './listings.service';

@Module({
  // `TeamsModule` pour `assertTeamAccess` : c'est lui qui porte la règle
  // « un entraîneur n'agit que sur ses équipes assignées », et la dupliquer ici
  // garantirait qu'un jour les deux divergent.
  imports: [ClubsModule, TeamsModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingsScheduler],
  // Exporté pour le feed et les interactions, qui liront les annonces actives.
  exports: [ListingsService],
})
export class ListingsModule {}
