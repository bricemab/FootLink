import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MyInterestsQueryDto } from './dto/interactions.dto';
import { InteractionsService, type InterestListing } from './interactions.service';

/**
 * Les gestes qui engagent.
 *
 * Separe du `feed`, qui PROPOSE : ici on ECRIT, et chaque ecriture a une
 * consequence pour quelqu'un d'autre — une notification, parfois un match.
 * Melanger la decouverte et l'engagement dans un meme module ferait tot ou tard
 * passer une lecture pour un accord.
 */
@Controller({ path: 'interactions', version: '1' })
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  /** Postuler. Le club est notifie. */
  @Post('listings/:id/apply')
  @HttpCode(HttpStatus.OK)
  apply(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<{ matched: boolean }> {
    return this.interactions.apply(userId, id);
  }

  /** Enregistrer : signet prive, personne n'est notifie. */
  @Post('listings/:id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.interactions.save(userId, id);
  }

  /** Retirer sa candidature ou son signet. Refuse si un match existe. */
  @Delete('listings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.interactions.remove(userId, id);
  }

  /** Ce que j'ai envoye et ce que j'ai garde. */
  @Get('mine')
  mine(
    @CurrentUser('userId') userId: string,
    @Query() query: MyInterestsQueryDto,
  ): Promise<InterestListing[]> {
    return this.interactions.mine(userId, query.kind);
  }

  /** Le club retient un joueur pour cette annonce. Le joueur est notifie. */
  @Post('listings/:id/players/:playerId/like')
  @HttpCode(HttpStatus.OK)
  like(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ): Promise<{ matched: boolean }> {
    return this.interactions.clubLike(userId, id, playerId);
  }

  /** Le club se retracte. Le joueur n'en est pas informe. */
  @Delete('listings/:id/players/:playerId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlike(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    await this.interactions.clubUnlike(userId, id, playerId);
  }

  /**
   * Les joueurs deja retenus sur cette annonce.
   *
   * Sert a l'ecran des correspondances : sans lui, le bouton « retenir »
   * repartirait de zero a chaque ouverture et le club ne saurait plus qui il a
   * deja vu.
   */
  @Get('listings/:id/likes')
  likes(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<string[]> {
    return this.interactions.clubLikes(userId, id);
  }
}
