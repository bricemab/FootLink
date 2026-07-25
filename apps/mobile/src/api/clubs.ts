import type { AppLocale, ClubStatus } from '@footlink/shared';
import type { AuthTokens } from './auth';
import { apiRequest } from './client';

export interface Region {
  code: string;
  labelFr: string;
  labelDe: string;
  active: boolean;
}

export interface ClubRequestPayload {
  clubName: string;
  /** Correction manuelle de l'association ; sinon le serveur la déduit du canton. */
  regionCode?: string;
  /**
   * Terrain du club. On n'envoie que le point et son libellé : le canton, la
   * commune et l'association en sont déduits côté serveur — un client ne décide
   * pas de la région dans laquelle son club est rangé.
   */
  lat?: number;
  lng?: number;
  stadiumName?: string;
  addressLine?: string;
  /** Repli quand la recherche d'adresse est indisponible. */
  locality?: string;
  /** Facultatif. Sans schéma (« fcsion.ch »), le serveur préfixe en https://. */
  websiteUrl?: string;
  requestNote?: string;
}

export interface ClubRequestResponse {
  club: { id: string; name: string; status: ClubStatus };
}

/** Public : les 13 associations régionales (seule l'AVF est active au MVP). */
export function listRegions(): Promise<Region[]> {
  return apiRequest<Region[]>('/regions');
}

/**
 * Demande de compte club, par un utilisateur **déjà authentifié**. Le club naît
 * en PENDING : rien ne sera publiable tant qu'un SUPER_ADMIN n'a pas validé.
 */
export function requestClub(
  accessToken: string,
  payload: ClubRequestPayload,
): Promise<ClubRequestResponse> {
  return apiRequest<ClubRequestResponse>('/clubs/requests', {
    method: 'POST',
    body: payload,
    accessToken,
  });
}

export interface MyClubResponse {
  club: {
    id: string;
    name: string;
    status: ClubStatus;
    canton: string | null;
    locality: string | null;
    stadiumName: string | null;
    addressLine: string | null;
    regionCode: string | null;
    websiteUrl: string | null;
    description: string | null;
    contactEmail: string | null;
    /** Faux = les joueurs ne verront pas l'adresse de contact. */
    showContactEmail: boolean;
  };
  membership: { role: 'CLUB_ADMIN' | 'COACH'; isOwner: boolean };
  /** Faux tant que le club n'est pas APPROVED : aucune équipe, aucun entraîneur. */
  canOperate: boolean;
  /**
   * Vue satellite du terrain, fabriquée par le serveur (l'URL porte le jeton
   * Mapbox, qui n'a rien à faire ici). `null` si le club n'a pas de point.
   */
  aerialUrl: string | null;
  /**
   * URL de lecture signee du logo, resolue par le serveur. `null` s'il n'y en a
   * pas : `Club.logoKey` porte la cle, et le bucket etant prive, l'adresse de
   * lecture est signee donc perissable.
   */
  logoUrl: string | null;
}

/**
 * `null` si le compte n'est rattaché à aucun club — le cas de tout joueur.
 *
 * NestJS sérialise un `null` retourné par un contrôleur en **corps vide**, que
 * le client HTTP rend donc en `undefined`. On normalise ici : laisser fuiter
 * deux « absences » différentes vers les écrans est une source de bugs, et le
 * type annoncé serait un mensonge.
 */
export async function getMyClub(accessToken: string): Promise<MyClubResponse | null> {
  return (await apiRequest<MyClubResponse | undefined>('/clubs/me', { accessToken })) ?? null;
}

/**
 * Modification de la fiche du club, reservee au CLUB_ADMIN (verifie serveur sur
 * le `ClubMember`, jamais sur le `User.role`).
 *
 * `canton` et `locality` n'y figurent pas volontairement : ils sont **recalcules**
 * a partir du point envoye. Un client ne decide pas de la region dans laquelle
 * son club est range.
 */
export interface UpdateClubPayload {
  name?: string;
  description?: string;
  websiteUrl?: string;
  contactEmail?: string;
  showContactEmail?: boolean;
  regionCode?: string;
  /** Deplacer le terrain : on n'envoie que le point et son libelle. */
  lat?: number;
  lng?: number;
  stadiumName?: string;
  addressLine?: string;
}

export function updateMyClub(
  accessToken: string,
  payload: UpdateClubPayload,
): Promise<MyClubResponse['club']> {
  return apiRequest<MyClubResponse['club']>('/clubs/me', {
    method: 'PATCH',
    body: payload,
    accessToken,
  });
}
