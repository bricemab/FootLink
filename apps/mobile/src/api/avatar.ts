import { apiRequest } from './client';
import type { UploadTicket } from './club-logo';

/**
 * Photo de profil de la personne, sur le stockage R2.
 *
 * Même chorégraphie en trois temps que le logo de club — billet, téléversement
 * direct, confirmation — et `putToStorage` est **partagé** avec lui : la
 * remarque sur `expo-file-system` y est écrite une seule fois, et un envoi qui
 * part vide est un défaut qu'on ne veut pas redécouvrir deux fois.
 *
 * La photo vit sur `User.avatarKey` et non sur le profil joueur : elle
 * appartient à la personne, pas à son rôle. Un entraîneur qui deviendrait joueur
 * garde la sienne.
 */

export function createAvatarUpload(
  accessToken: string,
  contentType: string,
): Promise<UploadTicket> {
  return apiRequest<UploadTicket>('/media/avatar/upload-url', {
    method: 'POST',
    body: { contentType },
    accessToken,
  });
}

export function confirmAvatar(
  accessToken: string,
  key: string,
): Promise<{ avatarUrl: string | null }> {
  return apiRequest<{ avatarUrl: string | null }>('/media/avatar/confirm', {
    method: 'POST',
    body: { key },
    accessToken,
  });
}

export function removeAvatar(accessToken: string): Promise<void> {
  return apiRequest<void>('/media/avatar', { method: 'DELETE', accessToken });
}
