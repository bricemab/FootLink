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

/** Invitation entraîneur : l'invité pose son mot de passe et récupère une session. */
export function acceptCoachInvite(token: string, password: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/coach-invite/accept', {
    method: 'POST',
    body: { token, password },
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
