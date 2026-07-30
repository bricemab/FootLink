import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module';
import { TeamsModule } from '../teams/teams.module';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

/**
 * ⚠️ `FeedModule` est importe pour ses GARDES, pas pour lister quoi que ce soit :
 * `assertListingOpenToPlayer` et `publicPlayer` portent deja les regles de
 * visibilite dans les deux sens. Les reecrire ici aurait produit deux verites
 * sur qui voit quoi.
 */
@Module({
  imports: [FeedModule, TeamsModule],
  controllers: [InteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
