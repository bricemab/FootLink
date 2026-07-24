/**
 * Catalogue de libellés FR/DE.
 *
 * L'API renvoie ses erreurs en anglais (messages techniques) : c'est ici que
 * l'on décide ce que l'utilisateur lit vraiment, à partir du code HTTP ou du
 * code métier (EMAIL_NOT_VERIFIED, ...).
 */
export const fr = {
  common: {
    continue: 'Continuer',
    back: 'Retour',
    retry: 'Réessayer',
    loading: 'Un instant…',
    email: 'Adresse email',
    password: 'Mot de passe',
    logout: 'Se déconnecter',
  },
  welcome: {
    tagline: 'Le foot amateur suisse,\nenfin connecté.',
    subtitle: 'Les joueurs trouvent un club. Les clubs trouvent leurs joueurs.',
    signUp: 'Créer mon compte',
    signIn: "J'ai déjà un compte",
  },
  login: {
    title: 'Content de te revoir',
    subtitle: 'Connecte-toi pour continuer.',
    submit: 'Se connecter',
    forgot: 'Mot de passe oublié ?',
    noAccount: 'Pas encore de compte ?',
  },
  register: {
    title: 'Rejoins FootLink',
    subtitle: 'Deux minutes, et ton profil est en ligne.',
    submit: 'Créer mon compte',
    hasAccount: 'Déjà inscrit ?',
    passwordHint: '8 caractères minimum, avec au moins une lettre et un chiffre.',
  },
  verify: {
    title: 'Confirme ton email',
    subtitle: 'On a envoyé un lien à {email}. Tant qu’il n’est pas validé, ton compte reste bloqué.',
    codeLabel: 'Code reçu par email',
    submit: 'Valider mon email',
    resend: 'Renvoyer l’email',
    resent: 'Email renvoyé.',
    done: 'Email confirmé !',
  },
  home: {
    title: 'Te voilà !',
    subtitle: 'Ton compte est actif. Les écrans de profil et le feed arrivent.',
    role: 'Rôle',
    status: 'Statut',
  },
  errors: {
    network: 'Serveur injoignable. Vérifie que l’API tourne et que tu es sur le même réseau.',
    invalidCredentials: 'Email ou mot de passe incorrect.',
    emailTaken: 'Un compte existe déjà avec cet email.',
    emailNotVerified: 'Confirme d’abord ton adresse email.',
    accountNotActive: 'Ce compte n’est pas actif.',
    invalidToken: 'Ce code est invalide ou expiré.',
    tooMany: 'Trop de tentatives. Réessaie dans une minute.',
    unknown: 'Quelque chose s’est mal passé.',
    required: 'Ce champ est obligatoire.',
    emailFormat: 'Cette adresse email n’est pas valide.',
    passwordFormat: '8 caractères minimum, avec une lettre et un chiffre.',
  },
};

// Structure identique : le typage garantit qu'aucune clé ne manque en allemand.
export const de: typeof fr = {
  common: {
    continue: 'Weiter',
    back: 'Zurück',
    retry: 'Erneut versuchen',
    loading: 'Einen Moment…',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    logout: 'Abmelden',
  },
  welcome: {
    tagline: 'Der Schweizer Amateurfussball,\nendlich vernetzt.',
    subtitle: 'Spieler finden einen Verein. Vereine finden ihre Spieler.',
    signUp: 'Konto erstellen',
    signIn: 'Ich habe bereits ein Konto',
  },
  login: {
    title: 'Schön, dich wiederzusehen',
    subtitle: 'Melde dich an, um fortzufahren.',
    submit: 'Anmelden',
    forgot: 'Passwort vergessen?',
    noAccount: 'Noch kein Konto?',
  },
  register: {
    title: 'Komm zu FootLink',
    subtitle: 'Zwei Minuten, und dein Profil ist online.',
    submit: 'Konto erstellen',
    hasAccount: 'Bereits registriert?',
    passwordHint: 'Mindestens 8 Zeichen, mit mindestens einem Buchstaben und einer Ziffer.',
  },
  verify: {
    title: 'Bestätige deine E-Mail',
    subtitle:
      'Wir haben einen Link an {email} geschickt. Solange er nicht bestätigt ist, bleibt dein Konto gesperrt.',
    codeLabel: 'Code aus der E-Mail',
    submit: 'E-Mail bestätigen',
    resend: 'E-Mail erneut senden',
    resent: 'E-Mail erneut gesendet.',
    done: 'E-Mail bestätigt!',
  },
  home: {
    title: 'Da bist du!',
    subtitle: 'Dein Konto ist aktiv. Profil und Feed folgen in Kürze.',
    role: 'Rolle',
    status: 'Status',
  },
  errors: {
    network: 'Server nicht erreichbar. Läuft die API, und bist du im selben Netzwerk?',
    invalidCredentials: 'E-Mail oder Passwort ist falsch.',
    emailTaken: 'Mit dieser E-Mail existiert bereits ein Konto.',
    emailNotVerified: 'Bestätige zuerst deine E-Mail-Adresse.',
    accountNotActive: 'Dieses Konto ist nicht aktiv.',
    invalidToken: 'Dieser Code ist ungültig oder abgelaufen.',
    tooMany: 'Zu viele Versuche. Bitte in einer Minute erneut versuchen.',
    unknown: 'Da ist etwas schiefgelaufen.',
    required: 'Dieses Feld ist erforderlich.',
    emailFormat: 'Diese E-Mail-Adresse ist ungültig.',
    passwordFormat: 'Mindestens 8 Zeichen, mit einem Buchstaben und einer Ziffer.',
  },
};

export type Messages = typeof fr;
