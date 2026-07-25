import type { AppLocale, UserRole, UserStatus } from '@footlink/shared';
import { apiRequest } from './client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
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

/** Ce que l'app doit demander à l'entraîneur une fois son email saisi. */
export type CoachEntryStep = 'CODE' | 'PASSWORD' | 'GOOGLE' | 'UNKNOWN';

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
