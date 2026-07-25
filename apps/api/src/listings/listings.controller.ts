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
import {
  CreateListingDto,
  DeleteListingQueryDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './dto/listing.dto';
import { ListingsService, type ListingDeletionImpact } from './listings.service';

/**
 * Annonces du club.
 *
 * Aucun `clubId` nulle part : il se dérive du token. Et aucune route publique
 * ici — le feed côté joueur sera un module distinct, avec ses propres règles de
 * visibilité (statut, saison, rayon). Mélanger les deux ferait fuiter les
 * brouillons d'un club dans le feed.
 */
@Controller({ path: 'listings', version: '1' })
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  list(@CurrentUser('userId') userId: string, @Query() query: ListListingsQueryDto) {
    return this.listings.listMine(userId, query);
  }

  @Get(':id')
  getOne(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.listings.getOne(userId, id);
  }

  // Ce que la suppression détruirait — de quoi alimenter l'alerte côté app.
  @Get(':id/deletion-impact')
  deletionImpact(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<ListingDeletionImpact> {
    return this.listings.getDeletionImpact(userId, id);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateListingDto) {
    return this.listings.createListing(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listings.updateListing(userId, id, dto);
  }

  /**
   * Suppression en cascade. Sans `?confirm=true`, l'API refuse et renvoie le
   * décompte : impossible de supprimer sans avoir de quoi prévenir la personne.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query() query: DeleteListingQueryDto,
  ): Promise<void> {
    await this.listings.deleteListing(userId, id, query.confirm === true);
  }
}
