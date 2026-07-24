import type { AppLocale } from '@footlink/shared';
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
  regionCode?: string;
  locality?: string;
  requestNote?: string;
}

export interface ClubRequestResponse {
  club: { id: string; name: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' };
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
  club: { id: string; name: string; status: string };
  membership: { role: 'CLUB_ADMIN' | 'COACH'; isOwner: boolean };
  canOperate: boolean;
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
