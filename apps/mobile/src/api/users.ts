import type { AppLocale } from '@footlink/shared';
import { apiRequest } from './client';

/**
 * Persiste la langue de l'utilisateur.
 *
 * Ce n'est pas qu'un confort d'affichage : c'est cette valeur qui décide de la
 * langue des **emails** et des notifications push, envoyés par le serveur alors
 * que l'app n'est pas ouverte.
 */
export function updateMyLocale(
  accessToken: string,
  locale: AppLocale,
): Promise<{ locale: AppLocale }> {
  return apiRequest<{ locale: AppLocale }>('/users/me/locale', {
    method: 'PATCH',
    body: { locale },
    accessToken,
  });
}
