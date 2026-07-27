import { PASSWORD_MIN_LENGTH } from '@footlink/shared';
import type { Messages } from '@/i18n/messages';

/*
 * Memes regles que les DTO cote API : on evite un aller-retour reseau pour une
 * erreur que le client peut voir tout de suite.
 *
 * 🔴 **La longueur vient de `packages/shared`, elle n'est PAS recopiee ici.**
 * Elle l'etait, figee a 8, et c'est ce qui a laisse passer le formulaire : quand
 * l'audit a porte le minimum a 10, le serveur a suivi, cette constante non. Le
 * client validait, le serveur refusait, et l'utilisateur voyait « Quelque chose
 * s'est mal passe » sans jamais savoir quoi corriger.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

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
  if (value.length >= PASSWORD_MIN_LENGTH && PASSWORD_PATTERN.test(value)) {
    return undefined;
  }
  // Le libelle porte `{min}` : on le remplit ici plutot que d'exiger `fill` de
  // chaque appelant, dont aucun n'a de raison de connaitre ce detail.
  return t.errors.passwordFormat.replace('{min}', String(PASSWORD_MIN_LENGTH));
}
