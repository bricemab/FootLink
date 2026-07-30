import { PASSWORD_MIN_LENGTH } from '@footlink/shared';
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
  if (error.code === 'EMAIL_ALREADY_USED') {
    return t.errors.emailTaken;
  }
  if (error.code === 'ACCOUNT_IS_GOOGLE') {
    return t.errors.accountIsGoogle;
  }
  if (error.code === 'CLUB_ALREADY_LINKED') {
    return t.errors.clubAlreadyLinked;
  }
  // Plafond d'invitations PAR ENTRAINEUR — a distinguer du 429 generique, qui
  // vient du rate-limit par IP et ne dit pas la meme chose a l'utilisateur.
  if (error.code === 'COACH_INVITE_RATE_LIMITED') {
    return t.errors.coachInviteRateLimited;
  }
  /*
   * 🔴 **« Mot de passe incorrect » ne vient QUE du serveur, jamais du statut.**
   * Le 401 y menait par defaut : un feed qui expirait affichait donc « Email ou
   * mot de passe incorrect » a quelqu'un dont la session etait parfaitement
   * valide en base. Vu a l'ecran, et impossible a diagnostiquer pour celui qui
   * le lit — il verifie un mot de passe qui n'a rien a se reprocher.
   *
   * L'authentification pose desormais `INVALID_CREDENTIALS` ; tout autre 401
   * est une session qui s'est terminee, et se dit comme telle.
   */
  if (error.code === 'INVALID_CREDENTIALS') {
    return t.errors.invalidCredentials;
  }
  // Les conflits du module d'interactions. Sans eux ils tombaient dans le repli
  // du 409 ci-dessous, qui parle d'adresse email : retirer une candidature
  // aurait repondu « un compte existe deja avec cet email ».
  if (error.code === 'ALREADY_APPLIED') {
    return t.errors.alreadyApplied;
  }
  if (error.code === 'MATCH_EXISTS') {
    return t.errors.matchExists;
  }
  switch (error.status) {
    case 401:
      return t.errors.sessionExpired;
    // Repli : un 409 sans code métier vient forcément d'un conflit d'adresse,
    // c'est le seul autre cas qui existe aujourd'hui. Les nouveaux conflits
    // doivent porter un code, pas s'appuyer sur ce repli.
    case 409:
      return t.errors.emailTaken;
    case 429:
      return t.errors.tooMany;
    case 400: {
      const detail = error.detail?.toLowerCase() ?? '';
      /*
       * 🔴 Un refus de mot de passe doit DIRE ce qui ne va pas. Il tombait dans
       * le repli « Quelque chose s'est mal passe » : l'utilisateur voyait un
       * echec sans cause ni remede, alors que le serveur avait explique
       * precisement le probleme. C'est le defaut qui a bloque l'activation d'un
       * entraineur, et il aurait bloque n'importe quelle inscription.
       */
      if (detail.includes('password')) {
        return t.errors.passwordTooWeak.replace('{min}', String(PASSWORD_MIN_LENGTH));
      }
      return detail.includes('token') ? t.errors.invalidToken : t.errors.unknown;
    }
    default:
      return t.errors.unknown;
  }
}
