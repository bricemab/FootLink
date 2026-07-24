import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Le jeton de session regroupe les frappes d'une même recherche et le choix
 * final en une seule session facturée chez Mapbox. Il est fabriqué par l'app,
 * n'identifie rien ni personne, et n'est jamais stocké.
 */
class SessionQuery {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  session!: string;
}

export class SearchPlacesQueryDto extends SessionQuery {
  // En dessous de 3 caractères, la recherche renvoie un bruit inexploitable et
  // on paierait un aller-retour réseau par frappe.
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  q!: string;
}

export class RetrievePlaceQueryDto extends SessionQuery {}
