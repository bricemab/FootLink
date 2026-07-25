import type { CategoryCode, Gender, Poste, StrongFoot } from '@footlink/shared';
import { apiRequest } from './client';

export interface PlayerPositionPayload {
  poste: Poste;
  isPrimary?: boolean;
}

/**
 * Profil joueur.
 *
 * `lat`/`lng` sont **déjà arrondis par l'app** avant l'envoi : la position
 * exacte du téléphone ne quitte pas l'appareil. Le serveur ré-arrondit de son
 * côté — il ne fait jamais confiance au client (AGENTS §6.5).
 */
export interface UpsertPlayerProfilePayload {
  firstName: string;
  lastName: string;
  birthYear: number;
  gender: Gender;
  positions: PlayerPositionPayload[];
  heightCm?: number;
  strongFoot?: StrongFoot;
  bio?: string;
  currentCategory?: CategoryCode;
  currentClubId?: string;
  currentClubName?: string;
  hideCurrentClub?: boolean;
  isSeekingClub?: boolean;
  isVisible?: boolean;
  canton?: string;
  locality?: string;
  lat?: number;
  lng?: number;
}

export interface PlayerProfileResponse {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  gender: Gender;
  isMinor: boolean;
  canton: string | null;
  locality: string | null;
  positions: { poste: Poste; isPrimary: boolean }[];
}

/**
 * `null` quand aucun profil n'existe — NestJS sérialise un `null` retourné par
 * un contrôleur en corps vide, que le client rend en `undefined`. On normalise
 * ici plutôt que de laisser fuiter deux « absences » différentes vers les écrans.
 */
export async function getMyPlayerProfile(
  accessToken: string,
): Promise<PlayerProfileResponse | null> {
  return (
    (await apiRequest<PlayerProfileResponse | undefined>('/players/me', { accessToken })) ?? null
  );
}

export function upsertMyPlayerProfile(
  accessToken: string,
  payload: UpsertPlayerProfilePayload,
): Promise<PlayerProfileResponse> {
  return apiRequest<PlayerProfileResponse>('/players/me', {
    method: 'PUT',
    body: payload,
    accessToken,
  });
}
