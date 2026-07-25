import type { ListingStatus } from '@/api/listings';
import type { useI18n } from '@/i18n';

/**
 * Présentation d'un statut d'annonce.
 *
 * Volontairement ici et non dans un fichier de route : deux écrans s'en servent,
 * et importer depuis une route couple deux destinations entre elles — un
 * déplacement de fichier casserait alors l'autre.
 */
export function statusLabel(status: ListingStatus, t: ReturnType<typeof useI18n>['t']): string {
  switch (status) {
    case 'ACTIVE':
      return t.listings.statusActive;
    case 'EXPIRED':
      return t.listings.statusExpired;
    case 'CLOSED':
      return t.listings.statusClosed;
    default:
      return t.listings.statusDraft;
  }
}

/**
 * Couleur du statut. Seule une annonce **publiée** est mise en avant : un
 * brouillon ou une annonce close ne reçoit rien, donc rien ne justifie de
 * l'accentuer. Une annonce échue est signalée en avertissement — c'est un état
 * subi, pas un choix.
 */
export function statusTone(status: ListingStatus): 'neutral' | 'accent' | 'warning' {
  if (status === 'ACTIVE') {
    return 'accent';
  }
  return status === 'EXPIRED' ? 'warning' : 'neutral';
}
