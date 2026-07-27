import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ResolveHereQueryDto, RetrievePlaceQueryDto, SearchPlacesQueryDto } from './dto/places.dto';
import {
  PlacesService,
  type PlaceSuggestion,
  type ResolvedPlace,
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
  /**
   * Commune et canton du point ou se trouve l'utilisateur.
   *
   * 🔴 **La position brute n'est ni stockee ni journalisee.** Elle sert le temps
   * d'un appel a deduire une commune, et c'est la commune qui est conservee. Le
   * profil, lui, ne garde que des coordonnees arrondies a ~1 km (AGENTS §6.5) —
   * cette route ne cree donc aucun nouveau stockage de position.
   *
   * Debit plus serre que la recherche : on n'appuie pas quinze fois sur
   * « utiliser ma position ».
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('here')
  here(@Query() query: ResolveHereQueryDto): Promise<ResolvedPlace> {
    return this.places.resolvePoint(query.lat, query.lng);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('places/:id')
  retrieve(
    @Param('id') id: string,
    @Query() query: RetrievePlaceQueryDto,
  ): Promise<ResolvedPlaceDetails> {
    return this.places.retrieve(id, query.session);
  }
}
