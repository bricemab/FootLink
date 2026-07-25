import type { AppLocale, ClubStatus, UserRole, UserStatus } from '@footlink/shared';
import { apiRequest } from './client';

/**
 * Prénom et nom annoncés par Google, pour **préremplir** un formulaire.
 *
 * Google énonce un nom, il ne le prouve pas : ces valeurs restent modifiables et
 * n'autorisent rien. Volontairement **non stockées** côté serveur — elles ne
 * servent qu'à l'onboarding qui suit la connexion (minimisation, AGENTS §10).
 *
 * L'année de naissance n'y est pas : elle n'existe pas dans le jeton ID Google.
 * L'obtenir demanderait la People API et le scope restreint `user.birthday.read`.
 */
export interface ProfileHints {
  firstName: string | null;
  lastName: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  /** Présent seulement quand l'entrée Google en a fourni. */
  profileHints?: ProfileHints;
}

/** Réponse de GET /auth/me — lue en base, donc toujours à jour. */
export interface MeResponse {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  locale: AppLocale;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
  /** Faux = le joueur doit passer l'onboarding avant d'entrer dans l'app. */
  hasPlayerProfile: boolean;
  /** URL de lecture signée de la photo de la personne, ou `null`. */
  avatarUrl: string | null;
  /**
   * Statut du club de la personne, `null` si elle n'en a aucun. Un CLUB_ADMIN à
   * `null` n'a pas fini d'envoyer sa demande.
   */
  clubStatus: ClubStatus | null;
}

export function register(email: string, password: string, locale: AppLocale): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/register', {
    method: 'POST',
    body: { email, password, locale },
  });
}

export function login(email: string, password: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/login', { method: 'POST', body: { email, password } });
}

/** Le serveur revérifie signature et audience du jeton : aucune confiance au client. */
export function googleSignIn(idToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/google', { method: 'POST', body: { idToken } });
}

/**
 * Entrée entraîneur par Google. Endpoint distinct de `googleSignIn`, qui crée
 * un compte pour une adresse inconnue : un entraîneur, lui, doit déjà avoir été
 * enregistré par son club. Sans invitation, le serveur répond 403
 * `COACH_NOT_INVITED` et **n'écrit rien**.
 */
export function googleCoachSignIn(idToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/google/coach', { method: 'POST', body: { idToken } });
}

/**
 * Entrée club par Google. Ne crée un compte que si l'adresse est **libre** : le
 * compte d'un club ne se greffe pas sur un compte personnel existant. Une
 * adresse déjà prise reçoit 409 `EMAIL_ALREADY_USED`.
 */
export function googleClubSignIn(idToken: string, locale: AppLocale): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/google/club', {
    method: 'POST',
    body: { idToken, locale },
  });
}

/** Inscription par email : on prouve l'adresse avant de créer quoi que ce soit. */
export function requestSignupCode(email: string, locale: AppLocale): Promise<void> {
  return apiRequest<void>('/auth/signup/request-code', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), locale },
  });
}

/** Contrôle le code d'inscription sans le consommer, dès la saisie des 6 chiffres. */
export function checkSignupCode(email: string, code: string): Promise<void> {
  return apiRequest<void>('/auth/signup/check-code', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), code: code.trim() },
  });
}

export function verifySignupCode(
  email: string,
  code: string,
  password: string,
): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/signup/verify-code', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), code: code.trim(), password },
  });
}

/**
 * Même inscription, empruntée depuis le parcours club : le compte naît
 * `CLUB_ADMIN`. C'est le chemin qui décide du rôle, pas un champ envoyé d'ici.
 */
export function verifyClubSignupCode(
  email: string,
  code: string,
  password: string,
): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/signup/verify-code/club', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), code: code.trim(), password },
  });
}

/** Ce que l'app doit demander à l'entraîneur une fois son email saisi. */
export type CoachEntryStep = 'CODE' | 'PASSWORD' | 'GOOGLE' | 'NOT_A_COACH' | 'UNKNOWN';

export function coachEntryStep(email: string): Promise<{ step: CoachEntryStep }> {
  return apiRequest<{ step: CoachEntryStep }>('/auth/coach-invite/status', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
  });
}

/** Contrôle le code sans le consommer, avant de demander un mot de passe. */
export function verifyCoachCode(email: string, code: string): Promise<void> {
  return apiRequest<void>('/auth/coach-invite/verify', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), code: code.trim() },
  });
}

/** Renvoie un code d'activation. Toujours 204, même si l'adresse est inconnue. */
export function resendCoachInvite(email: string): Promise<void> {
  return apiRequest<void>('/auth/coach-invite/resend', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
  });
}

/**
 * Activation d'un compte entraîneur : l'email a été enregistré par le club, le
 * code à 6 chiffres prouve l'accès à cette boîte mail. Valide le compte ET
 * l'email en un seul appel.
 */
export function acceptCoachInvite(
  email: string,
  code: string,
  password: string,
): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/coach-invite/accept', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), code: code.trim(), password },
  });
}

export function refresh(refreshToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken } });
}

export function logout(refreshToken: string, accessToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    accessToken,
  });
}

export function me(accessToken: string): Promise<MeResponse> {
  return apiRequest<MeResponse>('/auth/me', { accessToken });
}

export function verifyEmail(token: string): Promise<{ verified: boolean }> {
  return apiRequest<{ verified: boolean }>('/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
}

export function resendVerification(accessToken: string): Promise<void> {
  return apiRequest<void>('/auth/resend-verification', { method: 'POST', accessToken });
}
