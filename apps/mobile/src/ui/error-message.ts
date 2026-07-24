import { ApiError } from '@/api/client';
import type { Messages } from '@/i18n/messages';

/**
 * L'API répond en anglais avec un message technique ; l'app décide ce que
 * l'utilisateur lit. On s'appuie d'abord sur le code métier, puis sur le statut
 * HTTP, et on ne retombe sur le texte brut que si rien ne correspond.
 */
export function toUserMessage(error: unknown, t: Messages): string {
  if (!(error instanceof ApiError)) {
    return t.errors.unknown;
  }
  if (error.code === 'NETWORK') {
    return t.errors.network;
  }
  if (error.code === 'EMAIL_NOT_VERIFIED') {
    return t.errors.emailNotVerified;
  }
  if (error.code === 'ACCOUNT_NOT_ACTIVE') {
    return t.errors.accountNotActive;
  }
  switch (error.status) {
    case 401:
      return t.errors.invalidCredentials;
    case 409:
      return t.errors.emailTaken;
    case 429:
      return t.errors.tooMany;
    case 400:
      // Erreurs de validation (DTO) ou jeton email invalide.
      return error.detail?.toLowerCase().includes('token')
        ? t.errors.invalidToken
        : t.errors.unknown;
    default:
      return t.errors.unknown;
  }
}
