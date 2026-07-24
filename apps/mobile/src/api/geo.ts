import { apiRequest } from './client';

/**
 * Une suggestion n'a pas encore de coordonnées : le fournisseur facture une
 * « session » (toutes les frappes + UN choix). Résoudre chaque suggestion à
 * chaque frappe multiplierait la facture par le nombre de lignes affichées,
 * pour des lieux que personne ne va choisir.
 */
export interface PlaceSuggestion {
  id: string;
  /** Nom du lieu : « Stade de Pranoé ». */
  label: string;
  /** Situation : « 1971 Grimisuat, Suisse ». Peut être vide. */
  context: string;
}

/** Le lieu choisi, coordonnées comprises. */
export interface ResolvedPlace {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Déduits du point par le serveur (source officielle suisse). */
  canton: string;
  locality: string;
  /**
   * Association déduite du canton, `null` si la déduction n'est pas certaine.
   * Sert à présélectionner ; le serveur la recalcule de toute façon.
   */
  regionCode: string | null;
  /** Vue satellite prête à afficher, fabriquée par l'API (jeton côté serveur). */
  aerialUrl: string;
}

/**
 * Jeton de session : regroupe une recherche entière (frappes + choix) en une
 * seule session facturée. Il n'identifie personne et n'est jamais stocké — il
 * vit le temps d'une saisie.
 *
 * `crypto.randomUUID` n'existe pas dans le moteur JS de React Native, d'où
 * cette fabrication maison. Elle n'a aucun rôle de sécurité : le seul besoin
 * est que deux saisies simultanées ne partagent pas le même jeton.
 */
export function newSearchSession(): string {
  const chunk = (): string => Math.random().toString(36).slice(2, 10);
  return `${chunk()}${chunk()}${chunk()}${chunk()}`;
}

/**
 * Autocomplétion du terrain d'un club.
 *
 * L'app ne parle jamais au fournisseur directement : l'API sert de relais, ce
 * qui garde le jeton hors du binaire et permettra d'en changer sans publier une
 * nouvelle version.
 */
export function searchPlaces(
  accessToken: string,
  query: string,
  session: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  return apiRequest<PlaceSuggestion[]>(
    `/geo/places?q=${encodeURIComponent(query)}&session=${encodeURIComponent(session)}`,
    { accessToken, ...(signal ? { signal } : {}) },
  );
}

/** Coordonnées de la suggestion choisie. `session` doit être celle de la recherche. */
export function retrievePlace(
  accessToken: string,
  id: string,
  session: string,
  signal?: AbortSignal,
): Promise<ResolvedPlace> {
  return apiRequest<ResolvedPlace>(
    `/geo/places/${encodeURIComponent(id)}?session=${encodeURIComponent(session)}`,
    { accessToken, ...(signal ? { signal } : {}) },
  );
}
