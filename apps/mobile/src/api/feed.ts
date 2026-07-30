import type { CategoryCode, Gender, Poste, StrongFoot } from '@footlink/shared';
import { apiRequest } from './client';

/**
 * Le feed : ce que le joueur découvre, et ce que le club découvre.
 *
 * 🔴 **L'app ne filtre RIEN.** Tout est décidé par le serveur — statut, saison,
 * genre de l'équipe, catégories éligibles, correspondance de poste, rayon,
 * blocages. C'est ce qui garantit qu'on ne peut pas voir ce qui ne nous regarde
 * pas : un filtre côté app se contourne, un filtre en base ne se contourne pas.
 */

/**
 * Pourquoi cet élément est proposé.
 *
 * L'ordre EST l'ordre de pertinence : le serveur trie dessus avant la distance.
 * Une annonce qui cherche précisément ton poste passe donc avant une annonce
 * plus proche qui t'accepterait en dépannage.
 */
export type MatchKind =
  | 'POSTE_PRINCIPAL'
  | 'POSTE_SECONDAIRE'
  | 'POSTE_ACCEPTE'
  | 'POSTE_ACCEPTE_SECONDAIRE';

export interface FeedListing {
  id: string;
  posteRecherche: Poste;
  secondaryPostes: Poste[];
  description: string | null;
  season: string;
  createdAt: string;
  team: { id: string; name: string | null; category: CategoryCode; gender: Gender };
  club: { id: string; name: string; locality: string | null; canton: string | null };
  matchKind: MatchKind;
  /** Le poste qui a produit la rencontre — celui qu'on met en avant. */
  matchedPoste: Poste;
  /** Distance à vol d'oiseau, déjà arrondie au kilomètre par le serveur. */
  distanceKm: number;
}

export interface FeedPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  heightCm: number | null;
  strongFoot: StrongFoot | null;
  avatarUrl: string | null;
  currentCategory: CategoryCode | null;
  /** Null quand le joueur a choisi de masquer son club actuel. */
  currentClubName: string | null;
  locality: string | null;
  canton: string | null;
  bio: string | null;
  postes: { poste: Poste; isPrimary: boolean }[];
  matchKind: MatchKind;
  matchedPoste: Poste;
  distanceKm: number;
}

export interface FeedPage {
  limit?: number;
  offset?: number;
}

function query(page: FeedPage): string {
  const params = new URLSearchParams();
  if (page.limit !== undefined) {
    params.set('limit', String(page.limit));
  }
  if (page.offset !== undefined) {
    params.set('offset', String(page.offset));
  }
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}

export function listFeedListings(
  accessToken: string,
  page: FeedPage = {},
): Promise<FeedListing[]> {
  return apiRequest<FeedListing[]>(`/feed/listings${query(page)}`, { accessToken });
}

export function listFeedPlayers(
  accessToken: string,
  listingId: string,
  page: FeedPage = {},
): Promise<FeedPlayer[]> {
  return apiRequest<FeedPlayer[]>(`/feed/listings/${listingId}/players${query(page)}`, {
    accessToken,
  });
}

/**
 * La fiche publique d'un joueur.
 *
 * Le serveur refuse un joueur masque ou hors recherche, meme si on connait son
 * identifiant : atteindre par identifiant ce qu'on ne voit pas en liste serait
 * un IDOR.
 */
export function getFeedPlayer(accessToken: string, playerId: string): Promise<FeedPlayer> {
  return apiRequest<FeedPlayer>(`/feed/players/${playerId}`, { accessToken });
}

/** Le joueur ecarte une annonce : elle ne lui sera plus proposee. */
export function dismissListing(accessToken: string, listingId: string): Promise<void> {
  return apiRequest<void>(`/feed/listings/${listingId}/dismiss`, {
    method: 'POST',
    accessToken,
  });
}
