import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RetrievePlaceQueryDto, SearchPlacesQueryDto } from './dto/places.dto';
import {
  PlacesService,
  type PlaceSuggestion,
  type ResolvedPlaceDetails,
} from './places.service';

@Controller({ path: 'geo', version: '1' })
export class GeoController {
  constructor(private readonly places: PlacesService) {}

  /**
   * Autocomplétion d'un terrain : nom de stade ou adresse.
   *
   * Authentifié comme tout le reste : ce n'est pas une donnée sensible, mais
   * ouvrir un relais vers un service facturé à l'internet entier reviendrait à
   * offrir notre facture Mapbox à qui veut la faire gonfler.
   *
   * Le débit est plus large que le reste de l'API : la saisie est débattue côté
   * app, mais un utilisateur qui tape vite émet légitimement plusieurs requêtes
   * par seconde.
   */
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Get('places')
  search(@Query() query: SearchPlacesQueryDto): Promise<PlaceSuggestion[]> {
    return this.places.search(query.q, query.session);
  }

  /**
   * Coordonnées du lieu choisi. Séparé de la recherche parce que Mapbox facture
   * une session entière (N frappes + 1 choix) : résoudre chaque suggestion à
   * chaque frappe coûterait N fois plus, pour des points dont personne ne veut.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('places/:id')
  retrieve(
    @Param('id') id: string,
    @Query() query: RetrievePlaceQueryDto,
  ): Promise<ResolvedPlaceDetails> {
    return this.places.retrieve(id, query.session);
  }
}
