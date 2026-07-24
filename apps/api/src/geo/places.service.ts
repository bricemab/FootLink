import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isInSwitzerland, mapboxAerialUrl, regionForCanton } from '@footlink/shared';

/**
 * Recherche de lieux et résolution d'un point.
 *
 * Deux fournisseurs, chacun sur ce qu'il fait le mieux :
 *
 * - **Mapbox Search Box** pour CHERCHER. C'est le seul testé qui connaisse les
 *   terrains de football amateurs par leur nom : « Stade de Pranoé » sort en
 *   premier résultat, catégorisé `stade`. Le registre officiel swisstopo, lui,
 *   ne le contient pas du tout — il ne connaît que la *rue* de Pranoé. Pour une
 *   application de football de village, c'est rédhibitoire.
 *
 * - **swisstopo** pour SITUER. Une fois le point connu, le canton et la commune
 *   viennent des limites administratives officielles suisses. C'est gratuit,
 *   sans quota, et c'est la source qui fait foi — bien plus solide que le
 *   découpage d'un fournisseur américain pour décider de l'association
 *   régionale d'un club.
 *
 * Pourquoi côté serveur dans les deux cas :
 * - le client ne doit jamais être la source d'une donnée qu'on stocke ;
 * - le jeton Mapbox reste hors du binaire de l'app, donc remplaçable sans
 *   passer par les stores ;
 * - changer de fournisseur ne touche que ce fichier.
 *
 * Toute panne dégrade proprement (503) : elle ne doit jamais bloquer une
 * inscription — l'app retombe sur la saisie manuelle de la localité.
 */

const MAPBOX_SUGGEST = 'https://api.mapbox.com/search/searchbox/v1/suggest';
const MAPBOX_RETRIEVE = 'https://api.mapbox.com/search/searchbox/v1/retrieve';
const IDENTIFY_URL = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';

// Le calque communal porte à la fois le nom de la commune et le canton, et il
// couvre TOUT le territoire — y compris un terrain en plein champ, sans
// bâtiment. Le registre des bâtiments (`ch.bfs.gebaeude_wohnungs_register`) est
// plus riche mais ne répond rien hors bâti : inutilisable ici.
// Attention au suffixe `.fill` : sans lui, le calque ne renvoie aucun résultat.
const COMMUNE_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';

const TIMEOUT_MS = 5_000;

/**
 * Mots par lesquels les gens DÉSIGNENT un terrain, sans qu'ils fassent partie
 * de son nom.
 *
 * Mapbox est littéral : « stade de pranoé grimisuat » remonte le Stade de
 * Pranoé en premier, « terrain de pranoé grimisuat » ne le remonte pas du tout
 * — seulement des rues. Or l'utilisateur ne sait pas si son terrain est
 * enregistré comme « stade », « terrain » ou « centre sportif ».
 *
 * On rejoue donc la recherche sans ces mots quand la première n'a ramené aucun
 * lieu. Le repli est gratuit : Mapbox facture à la session, pas à l'appel.
 */
const GENERIC_WORDS = new Set([
  'stade',
  'stades',
  'terrain',
  'terrains',
  'centre',
  'sportif',
  'sportive',
  'football',
  'foot',
  'fc',
  'fussball',
  'sportplatz',
  'stadion',
]);

/**
 * Une suggestion n'a pas encore de coordonnées : Mapbox facture à la
 * « session » — autant d'appels `suggest` que de frappes, puis UN SEUL
 * `retrieve` sur le résultat choisi. Récupérer les coordonnées de chaque
 * suggestion à chaque frappe multiplierait la facture par le nombre de
 * résultats affichés, pour des points dont l'utilisateur ne veut pas.
 */
export interface PlaceSuggestion {
  /** Identifiant Mapbox, opaque ; à renvoyer tel quel pour obtenir le point. */
  id: string;
  /** Nom du lieu : « Stade de Pranoé ». */
  label: string;
  /** Situation : « 1971 Grimisuat, Suisse ». Vide pour un lieu sans adresse. */
  context: string;
}

export interface ResolvedPlaceDetails {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Déduits du point par swisstopo, jamais du fournisseur de recherche. */
  canton: string;
  locality: string;
  /**
   * Association régionale déduite du canton, ou `null` quand la déduction n'est
   * pas certaine (cf. CANTON_TO_REGION). L'app s'en sert pour présélectionner —
   * elle reste corrigeable, et le serveur la recalculera de toute façon.
   */
  regionCode: string | null;
  /**
   * Vue satellite prête à afficher. Fabriquée ici pour que le jeton Mapbox
   * reste hors du binaire de l'app : on le remplace alors sans republier.
   */
  aerialUrl: string;
}

export interface ResolvedPlace {
  canton: string;
  locality: string;
}

interface MapboxSuggestion {
  mapbox_id?: string;
  name?: string;
  place_formatted?: string;
  feature_type?: string;
}

interface MapboxSuggestResponse {
  suggestions?: MapboxSuggestion[];
}

interface MapboxRetrieveResponse {
  features?: {
    properties?: {
      name?: string;
      full_address?: string;
      place_formatted?: string;
    };
    geometry?: { coordinates?: number[] };
  }[];
}

interface IdentifyResponse {
  results?: {
    attributes?: {
      gemname?: string;
      kanton?: string;
    };
  }[];
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly mapboxToken: string;

  constructor(config: ConfigService) {
    this.mapboxToken = config.get<string>('mapbox.token') ?? '';
    if (this.mapboxToken.length === 0) {
      this.logger.warn('MAPBOX_TOKEN is not set: place search is disabled.');
    }
  }

  get searchEnabled(): boolean {
    return this.mapboxToken.length > 0;
  }

  /**
   * Suggestions pour une saisie libre, restreintes à la Suisse.
   *
   * Un seul champ couvre les deux façons de chercher — « Stade de Pranoé » ou
   * « route de la Crettaz 6 » — parce qu'un responsable de club n'a aucune
   * raison de savoir si son terrain est référencé comme lieu ou comme adresse.
   */
  async search(query: string, session: string): Promise<PlaceSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }
    if (!this.searchEnabled) {
      throw new ServiceUnavailableException('Place search is not configured.');
    }

    const asTyped = await this.suggest(trimmed, session);

    // « terrain de pranoé grimisuat » ne ramène que des rues, alors que
    // « pranoé grimisuat » ramène le Stade de Pranoé en premier. On ne rejoue
    // que si la première passe n'a trouvé aucun LIEU : quand elle en trouve
    // (« terrain grimisuat » remonte bien « Terrain de football »), le mot
    // générique était le bon et l'enlever appauvrirait le résultat.
    const stripped = trimmed
      .split(/\s+/)
      .filter((word) => !GENERIC_WORDS.has(fold(word)))
      .join(' ');

    const needsFallback =
      stripped.length >= 3 &&
      fold(stripped) !== fold(trimmed) &&
      !asTyped.some((item) => item.kind === 'poi');

    // Repli gratuit : même session, donc toujours une seule session facturée.
    const merged = needsFallback ? [...(await this.suggest(stripped, session)), ...asTyped] : asTyped;

    const seen = new Set<string>();
    return merged
      .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)))
      // Un lieu nommé est presque toujours ce qu'on cherche ; une rue n'est
      // qu'un repli. Tri stable, donc l'ordre de Mapbox est conservé à
      // l'intérieur de chaque groupe.
      .sort((a, b) => Number(b.kind === 'poi') - Number(a.kind === 'poi'))
      .slice(0, 6)
      .map(({ id, label, context }) => ({ id, label, context }));
  }

  private async suggest(
    query: string,
    session: string,
  ): Promise<(PlaceSuggestion & { kind: string })[]> {
    const url =
      `${MAPBOX_SUGGEST}?q=${encodeURIComponent(query)}` +
      `&language=fr&country=ch&limit=8&types=poi,address,street,place` +
      `&session_token=${encodeURIComponent(session)}` +
      `&access_token=${encodeURIComponent(this.mapboxToken)}`;

    const body = await this.fetchJson<MapboxSuggestResponse>(url, 'place search');

    return (body.suggestions ?? []).flatMap((suggestion) => {
      // Mapbox renvoie aussi des *catégories* (« Terrain de football » comme
      // filtre, sans lieu derrière). Elles n'ont pas de point et ne mènent
      // nulle part : on les écarte.
      if (!suggestion.mapbox_id || !suggestion.name || suggestion.feature_type === 'category') {
        return [];
      }
      return [
        {
          id: suggestion.mapbox_id,
          label: suggestion.name,
          context: suggestion.place_formatted ?? '',
          kind: suggestion.feature_type ?? '',
        },
      ];
    });
  }

  /** Coordonnées d'une suggestion choisie. `session` doit être celle de la recherche. */
  async retrieve(id: string, session: string): Promise<ResolvedPlaceDetails> {
    if (!this.searchEnabled) {
      throw new ServiceUnavailableException('Place search is not configured.');
    }

    const url =
      `${MAPBOX_RETRIEVE}/${encodeURIComponent(id)}` +
      `?session_token=${encodeURIComponent(session)}` +
      `&access_token=${encodeURIComponent(this.mapboxToken)}`;

    const body = await this.fetchJson<MapboxRetrieveResponse>(url, 'place retrieval');
    const feature = (body.features ?? [])[0];
    const coordinates = feature?.geometry?.coordinates;
    const [lng, lat] = coordinates ?? [];

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException('This place has no usable location.');
    }
    // Canton et commune viennent de swisstopo, pas de Mapbox : c'est la source
    // officielle, et c'est elle qui décide de l'association régionale.
    const { canton, locality } = await this.resolvePoint(lat, lng);

    return {
      id,
      label: feature?.properties?.name ?? '',
      lat,
      lng,
      canton,
      locality,
      regionCode: regionForCanton(canton),
      aerialUrl: this.aerialUrl(lat, lng),
    };
  }

  /** Vue satellite d'un point. Vide si Mapbox n'est pas configuré. */
  aerialUrl(lat: number, lng: number): string {
    return this.searchEnabled ? mapboxAerialUrl(lat, lng, this.mapboxToken) : '';
  }

  /**
   * Commune et canton d'un point — la seule source de vérité pour ces deux
   * champs. Ce que le client a envoyé n'est jamais recopié : il ne maîtrise que
   * l'emplacement du terrain de SON club, ce qui est légitime, mais pas le
   * canton qui en découle ni l'association régionale qui en découle à son tour.
   */
  async resolvePoint(lat: number, lng: number): Promise<ResolvedPlace> {
    if (!isInSwitzerland(lat, lng)) {
      throw new BadRequestException('The pitch location must be in Switzerland.');
    }

    const extent = [lng - 0.02, lat - 0.02, lng + 0.02, lat + 0.02].join(',');
    const url =
      `${IDENTIFY_URL}?geometry=${lng},${lat}&geometryType=esriGeometryPoint` +
      `&layers=all:${COMMUNE_LAYER}&mapExtent=${extent}` +
      '&imageDisplay=1000,1000,96&tolerance=0&sr=4326&returnGeometry=false';

    const body = await this.fetchJson<IdentifyResponse>(url, 'point resolution');
    const attributes = (body.results ?? [])[0]?.attributes;
    const canton = attributes?.kanton;
    const locality = attributes?.gemname;

    // Pas de commune au point : on est hors territoire communal (un lac, ou
    // au-delà de la frontière). Refuser vaut mieux qu'enregistrer un club sans
    // canton, qui serait ensuite invisible dans toutes les recherches par région.
    if (!canton || !locality) {
      throw new BadRequestException('No Swiss municipality found at this location.');
    }

    return { canton: canton.toUpperCase(), locality };
  }

  private async fetchJson<T>(url: string, what: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.warn(`Place provider unreachable during ${what}: ${describe(error)}`);
      throw new ServiceUnavailableException('The address service is temporarily unavailable.');
    }

    if (!response.ok) {
      // L'URL contient le jeton : on ne loge que le statut, jamais l'URL.
      this.logger.warn(`Place provider returned ${response.status} during ${what}`);
      throw new ServiceUnavailableException('The address service is temporarily unavailable.');
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`Place provider sent a malformed body during ${what}: ${describe(error)}`);
      throw new ServiceUnavailableException('The address service is temporarily unavailable.');
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Sans accents ni casse : « Pranoé » et « pranoe » doivent se rencontrer. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
