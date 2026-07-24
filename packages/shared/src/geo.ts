// Géographie suisse partagée entre l'API et le mobile.
// (l'identité des adresses email vit dans `email.ts`)
//
// Deux choses vivent ici :
//   1. la correspondance canton -> association régionale ;
//   2. la fabrication de l'URL de la photo aérienne d'un terrain.
//
// Les deux servent des deux côtés : l'API dérive la région à la création d'un
// club, le mobile affiche la même image que celle qu'un futur écran club
// affichera. Dupliquer ces règles dans les deux applications finirait par les
// faire diverger.

/** Les 26 cantons, code officiel à deux lettres. */
export const SWISS_CANTONS = [
  'AG',
  'AI',
  'AR',
  'BE',
  'BL',
  'BS',
  'FR',
  'GE',
  'GL',
  'GR',
  'JU',
  'LU',
  'NE',
  'NW',
  'OW',
  'SG',
  'SH',
  'SO',
  'SZ',
  'TG',
  'TI',
  'UR',
  'VD',
  'VS',
  'ZG',
  'ZH',
] as const;

export type SwissCanton = (typeof SWISS_CANTONS)[number];

export function isSwissCanton(value: string): value is SwissCanton {
  return (SWISS_CANTONS as readonly string[]).includes(value);
}

/**
 * Canton -> code d'association régionale, **uniquement quand c'est certain**.
 *
 * Volontairement incomplet. Les associations romandes listées ici sont
 * mono-cantonales, donc la déduction est sans ambiguïté. Ce n'est PAS le cas
 * des autres :
 *
 * - le Jura est revendiqué par deux entrées de la nomenclature (`ajf`, et
 *   `fvbj` = « Bern/Jura ») ;
 * - `fvnws`, `sfvar`, `ifv`, `ofv`, `fvrz` couvrent chacune plusieurs cantons,
 *   et le découpage exact n'a pas été vérifié ;
 * - `aftg` est libellé « Association Fribourgeoise / Tessin » dans
 *   `nomenclature_football_suisse.json`, ce qui est incohérent.
 *
 * `nomenclature_football_suisse.json` le dit lui-même : « la liste précise des
 * 13 associations doit être confirmée sur football.ch avant l'extension
 * nationale ; codes indicatifs ». Tant que ce n'est pas fait, on préfère ne
 * rien deviner : un canton absent de cette table laisse simplement le choix à
 * l'utilisateur au lieu de lui imposer une association fausse.
 *
 * Sans effet au MVP : seule l'AVF est ouverte.
 */
export const CANTON_TO_REGION: Partial<Record<SwissCanton, string>> = {
  VS: 'avf',
  VD: 'acvf',
  GE: 'acgf',
  NE: 'anf',
  FR: 'aff',
};

/** `null` quand la déduction n'est pas certaine — l'appelant demande alors à l'utilisateur. */
export function regionForCanton(canton: string): string | null {
  const upper = canton.toUpperCase();
  if (!isSwissCanton(upper)) {
    return null;
  }
  return CANTON_TO_REGION[upper] ?? null;
}

// --- Photo aérienne ---------------------------------------------------------

/**
 * Emprise approximative de la Suisse (WGS 84). Sert de garde-fou avant tout
 * appel réseau : un point hors de cette boîte ne peut pas être un terrain
 * suisse, inutile d'interroger swisstopo pour s'en rendre compte.
 */
export const SWISS_BBOX = { minLat: 45.79, maxLat: 47.81, minLng: 5.93, maxLng: 10.5 } as const;

export function isInSwitzerland(lat: number, lng: number): boolean {
  return (
    lat >= SWISS_BBOX.minLat &&
    lat <= SWISS_BBOX.maxLat &&
    lng >= SWISS_BBOX.minLng &&
    lng <= SWISS_BBOX.maxLng
  );
}

export interface AerialImageOptions {
  width?: number;
  height?: number;
  /** Plus grand = plus serré sur le terrain. 16.5 cadre un terrain de football. */
  zoom?: number;
}

/**
 * Vue satellite cadrée sur un point (Mapbox Static Images).
 *
 * Style `satellite-v9` : de l'imagerie NUE, sans routes ni étiquettes. La
 * variante `satellite-streets` superpose les noms de commerces et de rues —
 * lisible sur une carte, mais chargée et bavarde dans une fiche de club.
 *
 * Aucun marqueur : le terrain est au centre du cadre et se reconnaît seul. Un
 * point posé dessus masquerait justement ce qu'on cherche à montrer.
 *
 * `logo=false&attribution=false` retire les mentions incrustées dans l'image.
 * Mapbox l'autorise **à condition d'afficher l'attribution ailleurs dans
 * l'interface** : c'est le rôle d'`AERIAL_ATTRIBUTION`, affiché sous l'image.
 * Ne pas retirer l'un sans l'autre.
 *
 * Le jeton est un jeton PUBLIC (`pk.…`), conçu pour être visible côté client.
 * On construit malgré tout ces URL côté serveur : le jeton n'entre donc jamais
 * dans le binaire de l'app, et le remplacer ne demande aucune republication.
 */
export function mapboxAerialUrl(
  lat: number,
  lng: number,
  token: string,
  options: AerialImageOptions = {},
): string {
  const { width = 880, height = 400, zoom = 16.5 } = options;
  const params = new URLSearchParams({
    access_token: token,
    logo: 'false',
    attribution: 'false',
  });
  // @2x : l'image est rendue au double de la densité demandée. Sans lui, une
  // photo de 880 px étirée sur un écran à 3x est visiblement molle.
  return (
    'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/' +
    `${lng},${lat},${zoom},0/${width}x${height}@2x?${params.toString()}`
  );
}

/**
 * Mention à afficher **sous** l'image, puisqu'elle n'y est plus incrustée.
 * Exigée par les conditions d'utilisation de Mapbox.
 *
 * C'est mot pour mot la chaîne que Mapbox incruste lui-même sur ce style. Ne
 * pas la raccourcir : Maxar est l'opérateur satellite dont l'imagerie est
 * licenciée, et OpenStreetMap figure dans l'attribution du style même quand
 * aucune étiquette n'est rendue. Décider à leur place de ce que leur licence
 * exige n'est pas notre rôle.
 */
export const AERIAL_ATTRIBUTION = '© Maxar © Mapbox © OpenStreetMap';
