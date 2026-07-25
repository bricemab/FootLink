import type { CategoryCode, Gender, Poste } from '@footlink/shared';
import { apiRequest } from './client';

/**
 * Annonces du club.
 *
 * Comme partout côté club, **aucun `clubId` n'est envoyé** : il se dérive du
 * token (anti-IDOR). La **saison** n'est pas envoyée non plus — le serveur la
 * calcule, sinon l'horloge d'un téléphone déciderait dans quelle saison une
 * annonce atterrit.
 */

export type ListingStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';

/** Plafond aligné sur le DTO serveur : au-delà, l'annonce ne filtre plus rien. */
export const MAX_SECONDARY_POSTES = 3;

export interface Listing {
  id: string;
  teamId: string;
  posteRecherche: Poste;
  secondaryPostes: Poste[];
  description: string | null;
  status: ListingStatus;
  season: string;
  expiresAt: string | null;
  createdAt: string;
  team: { id: string; name: string | null; category: CategoryCode; gender: Gender };
  /** Candidatures reçues et matchs conclus — ce que la suppression détruirait. */
  applicationCount: number;
  matchCount: number;
}

/** Ligne brute, telle que la renvoient la création et la mise à jour. */
export interface ListingRow {
  id: string;
  teamId: string;
  posteRecherche: Poste;
  secondaryPostes: Poste[] | null;
  description: string | null;
  status: ListingStatus;
  season: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ListingDeletionImpact {
  listingId: string;
  applications: number;
  clubInterests: number;
  matches: number;
  conversations: number;
  messages: number;
  isEmpty: boolean;
}

export interface CreateListingInput {
  teamId: string;
  posteRecherche: Poste;
  secondaryPostes?: Poste[];
  description?: string;
  expiresAt?: string;
  /** Faux ou absent = l'annonce naît en brouillon. Publier est un geste. */
  publish?: boolean;
}

export type UpdateListingInput = Partial<{
  posteRecherche: Poste;
  secondaryPostes: Poste[];
  description: string;
  expiresAt: string;
  /** `EXPIRED` n'y figure pas : il est posé par l'ordonnanceur, jamais à la main. */
  status: Exclude<ListingStatus, 'EXPIRED'>;
}>;

/** Forme brute des endpoints enrichis. Ne sort pas de ce fichier. */
interface ListingApi extends Omit<Listing, 'secondaryPostes' | 'applicationCount' | 'matchCount'> {
  secondaryPostes: Poste[] | null;
  _count: { interests: number; matches: number };
}

function toListing(raw: ListingApi): Listing {
  return {
    id: raw.id,
    teamId: raw.teamId,
    posteRecherche: raw.posteRecherche,
    // Le champ est un `Json?` en base : on ne lui fait pas confiance en lecture.
    secondaryPostes: Array.isArray(raw.secondaryPostes) ? raw.secondaryPostes : [],
    description: raw.description,
    status: raw.status,
    season: raw.season,
    expiresAt: raw.expiresAt,
    createdAt: raw.createdAt,
    team: raw.team,
    applicationCount: raw._count.interests,
    matchCount: raw._count.matches,
  };
}

/**
 * Liste **filtrée par le serveur** selon le rôle : toutes les annonces du club
 * pour un CLUB_ADMIN, seulement celles de ses équipes pour un entraîneur.
 */
export async function listMyListings(
  accessToken: string,
  filter: { teamId?: string; status?: ListingStatus } = {},
): Promise<Listing[]> {
  const params = new URLSearchParams();
  if (filter.teamId) {
    params.set('teamId', filter.teamId);
  }
  if (filter.status) {
    params.set('status', filter.status);
  }
  const query = params.toString();
  const raw = await apiRequest<ListingApi[]>(`/listings${query ? `?${query}` : ''}`, {
    accessToken,
  });
  return raw.map(toListing);
}

export async function getListing(accessToken: string, listingId: string): Promise<Listing> {
  return toListing(await apiRequest<ListingApi>(`/listings/${listingId}`, { accessToken }));
}

export function createListing(
  accessToken: string,
  input: CreateListingInput,
): Promise<ListingRow> {
  return apiRequest<ListingRow>('/listings', { method: 'POST', body: input, accessToken });
}

export function updateListing(
  accessToken: string,
  listingId: string,
  input: UpdateListingInput,
): Promise<ListingRow> {
  return apiRequest<ListingRow>(`/listings/${listingId}`, {
    method: 'PATCH',
    body: input,
    accessToken,
  });
}

/** À lire AVANT de proposer la suppression : c'est le contenu de l'alerte. */
export function getListingDeletionImpact(
  accessToken: string,
  listingId: string,
): Promise<ListingDeletionImpact> {
  return apiRequest<ListingDeletionImpact>(`/listings/${listingId}/deletion-impact`, {
    accessToken,
  });
}

/**
 * Suppression en cascade. `confirm=true` n'est envoyé qu'après que la personne a
 * vu le décompte ; sans lui l'API répond 409 avec ce décompte.
 */
export function deleteListing(accessToken: string, listingId: string): Promise<void> {
  return apiRequest<void>(`/listings/${listingId}?confirm=true`, {
    method: 'DELETE',
    accessToken,
  });
}
