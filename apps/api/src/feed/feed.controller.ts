import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeedQueryDto } from './dto/feed.dto';
import { FeedService, type FeedListing, type FeedPlayer } from './feed.service';

/**
 * Le feed, dans les deux sens.
 *
 * Distinct du module `listings`, qui sert la GESTION des annonces par leur club.
 * Ici on sert la DECOUVERTE, et les regles de visibilite n'ont rien a voir : un
 * club voit ses brouillons, un joueur ne doit jamais les voir. Melanger les deux
 * dans un meme service ferait tot ou tard fuiter un brouillon dans le feed.
 */
@Controller({ path: 'feed', version: '1' })
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  /** Les annonces qui correspondent au joueur connecte. */
  @Get('listings')
  listings(
    @CurrentUser('userId') userId: string,
    @Query() query: FeedQueryDto,
  ): Promise<FeedListing[]> {
    return this.feed.listingsForPlayer(userId, query);
  }

  /** Les joueurs qui correspondent a une annonce du club connecte. */
  @Get('listings/:id/players')
  players(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query() query: FeedQueryDto,
  ): Promise<FeedPlayer[]> {
    return this.feed.playersForListing(userId, id, query);
  }
}
