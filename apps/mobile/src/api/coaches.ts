import type { AppLocale, CategoryCode, Gender } from '@footlink/shared';
import { apiRequest } from './client';

/**
 * Comptes entraîneurs d'un club.
 *
 * Un entraîneur **ne s'inscrit pas** : son compte est créé ici par son club, qui
 * saisit son identité avant même que le compte existe — d'où `firstName` et
 * `lastName` portés par `ClubMember` et non par `User` (décision 33 du HANDOFF).
 * L'invité choisit ensuite son mot de passe avec le code reçu par email.
 *
 * Comme pour les équipes, aucun `clubId` n'est envoyé : il vient du token.
 * Réservé au CLUB_ADMIN — le serveur le vérifie sur `ClubMember.role`, jamais
 * sur `User.role`, pour qu'un joueur qui dirige aussi un club garde ses droits.
 */

export interface Coach {
  clubMemberId: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: AppLocale;
  /** Faux = invitation envoyée, compte pas encore activé. */
  hasAccepted: boolean;
  emailVerified: boolean;
  /**
   * Null tant que l'email n'est pas parti : l'envoi a lieu APRES la reponse
   * HTTP, donc la fiche existe avant que l'invitation ait quitte le serveur.
   */
  inviteSentAt: string | null;
  /** Renseigne quand le dernier envoi a echoue — il faut alors reessayer. */
  inviteFailedAt: string | null;
  teams: { id: string; name: string | null; category: CategoryCode; gender: Gender }[];
  createdAt: string;
}

export interface CreateCoachInput {
  email: string;
  firstName: string;
  lastName: string;
  locale?: AppLocale;
  /** Équipes assignées d'emblée. Le serveur vérifie qu'elles sont bien du club. */
  teamIds?: string[];
}

export function listCoaches(accessToken: string): Promise<Coach[]> {
  return apiRequest<Coach[]>('/clubs/me/coaches', { accessToken });
}

export function createCoach(accessToken: string, input: CreateCoachInput): Promise<Coach> {
  return apiRequest<Coach>('/clubs/me/coaches', { method: 'POST', body: input, accessToken });
}

/**
 * Renvoie un code d'activation. Utile quand l'invitation s'est perdue ou que le
 * code a été brûlé par cinq essais ratés.
 */
export function resendCoachInvite(accessToken: string, clubMemberId: string): Promise<void> {
  return apiRequest<void>(`/clubs/me/coaches/${clubMemberId}/invite`, {
    method: 'POST',
    accessToken,
  });
}

/**
 * **Remplace intégralement** les équipes de l'entraîneur : envoyer une liste
 * vide le détache de tout. Ce n'est pas un ajout — l'écran doit donc envoyer
 * l'état complet voulu, pas un delta.
 */
export function setCoachTeams(
  accessToken: string,
  clubMemberId: string,
  teamIds: string[],
): Promise<Coach> {
  return apiRequest<Coach>(`/clubs/me/coaches/${clubMemberId}/teams`, {
    method: 'PUT',
    body: { teamIds },
    accessToken,
  });
}

export function removeCoach(accessToken: string, clubMemberId: string): Promise<void> {
  return apiRequest<void>(`/clubs/me/coaches/${clubMemberId}`, {
    method: 'DELETE',
    accessToken,
  });
}
