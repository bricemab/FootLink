import type { Messages } from '@/i18n/messages';

// Mêmes règles que les DTO côté API (auth.dto.ts) : on évite un aller-retour
// réseau pour une erreur que le client peut voir tout de suite.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MIN_LENGTH = 8;

export function validateEmail(value: string, t: Messages): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return t.errors.required;
  }
  return EMAIL_PATTERN.test(trimmed) ? undefined : t.errors.emailFormat;
}

export function validatePassword(value: string, t: Messages): string | undefined {
  if (value.length === 0) {
    return t.errors.required;
  }
  return value.length >= PASSWORD_MIN_LENGTH && PASSWORD_PATTERN.test(value)
    ? undefined
    : t.errors.passwordFormat;
}
