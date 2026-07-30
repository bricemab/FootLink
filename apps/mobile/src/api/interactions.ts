import type { CategoryCode, Gender, Poste } from '@footlink/shared';
import { apiRequest } from './client';

/**
 * Les gestes qui engagent.
 *
 * Distinct de `feed.ts`, qui ne fait que LIRE ce qu'on nous propose. Ici chaque
 * appel a une consequence pour quelqu'un d'autre — sauf un seul, et c'est
 * justement celui qui manquait.
 */

/**
 * 🔴 **`SAVED` ne previent personne.** C'est un signet prive : le club ne sait
 * pas qu'on l'a garde de cote, et un enregistrement ne produira jamais de match
 * a lui seul. C'est ce qui permet de garder trois annonces, de les comparer au
 * calme, puis de n'en choisir qu'une.
 */
export type InterestKind = 'APPLIED' | 'SAVED';

export type ListingStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';

export interface InterestListing {
  id: string;
  kind: InterestKind;
  /** Quand on s'est prononce — pas la date de l'annonce. */
  decidedAt: string;
  posteRecherche: Poste;
  secondaryPostes: Poste[];
  description: string | null;
  season: string;
  /** Le club a pu fermer son annonce entre-temps : le cacher serait malhonnete. */
  status: ListingStatus;
  team: { id: string; name: string | null; category: CategoryCode; gender: Gender };
  club: { id: string; name: string; locality: string | null; canton: string | null };
  distanceKm: number;
  /** Vrai quand le club a repondu : il y a un match. */
  matched: boolean;
}

/** Postuler. Le club est notifie. Renvoie vrai si un match vient de naitre. */
export function applyToListing(
  accessToken: string,
  listingId: string,
): Promise<{ matched: boolean }> {
  return apiRequest<{ matched: boolean }>(`/interactions/listings/${listingId}/apply`, {
    method: 'POST',
    accessToken,
  });
}

/** Enregistrer. Aucune notification, aucun match. */
export function saveListing(accessToken: string, listingId: string): Promise<void> {
  return apiRequest<void>(`/interactions/listings/${listingId}/save`, {
    method: 'POST',
    accessToken,
  });
}

/**
 * Retirer sa candidature ou son signet.
 *
 * Repond 409 `MATCH_EXISTS` si le club a deja repondu : on ne fait pas
 * disparaitre une conversation ouverte sans un mot.
 */
export function removeInterest(accessToken: string, listingId: string): Promise<void> {
  return apiRequest<void>(`/interactions/listings/${listingId}`, {
    method: 'DELETE',
    accessToken,
  });
}

/** Ce que j'ai envoye, ce que j'ai garde. */
export function listMyInterests(
  accessToken: string,
  kind?: InterestKind,
): Promise<InterestListing[]> {
  return apiRequest<InterestListing[]>(
    `/interactions/mine${kind ? `?kind=${kind}` : ''}`,
    { accessToken },
  );
}

/** Le club retient un joueur pour cette annonce. Le joueur est notifie. */
export function likePlayer(
  accessToken: string,
  listingId: string,
  playerId: string,
): Promise<{ matched: boolean }> {
  return apiRequest<{ matched: boolean }>(
    `/interactions/listings/${listingId}/players/${playerId}/like`,
    { method: 'POST', accessToken },
  );
}

/** Le club se retracte. Le joueur n'en est pas informe. */
export function unlikePlayer(
  accessToken: string,
  listingId: string,
  playerId: string,
): Promise<void> {
  return apiRequest<void>(`/interactions/listings/${listingId}/players/${playerId}/like`, {
    method: 'DELETE',
    accessToken,
  });
}

/** Les joueurs deja retenus sur cette annonce. */
export function listListingLikes(accessToken: string, listingId: string): Promise<string[]> {
  return apiRequest<string[]>(`/interactions/listings/${listingId}/likes`, { accessToken });
}

/** Le joueur revient sur un rejet : l'annonce redevient proposable. */
export function undismissListing(accessToken: string, listingId: string): Promise<void> {
  return apiRequest<void>(`/feed/listings/${listingId}/dismiss`, {
    method: 'DELETE',
    accessToken,
  });
}
