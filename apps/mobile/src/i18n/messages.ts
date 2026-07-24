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
  google: {
    signIn: 'Continuer avec Google',
    separator: 'ou',
    needsDevBuild:
      "Google Sign-In ne fonctionne pas dans Expo Go : il faut une version de développement de l'app. Utilise l'email et le mot de passe en attendant.",
    failed: 'La connexion Google a échoué.',
  },
  coachInvite: {
    title: 'Bienvenue dans ton club',
    subtitle: 'Choisis ton mot de passe pour activer ton compte entraîneur.',
    submit: 'Activer mon compte',
    missingToken: "Ce lien d'invitation est incomplet. Rouvre-le depuis ton email.",
  },
  register: {
    title: 'Rejoins FootLink',
    subtitle: 'Deux minutes, et ton profil est en ligne.',
    submit: 'Créer mon compte',
    hasAccount: 'Déjà inscrit ?',
    passwordHint: '8 caractères minimum, avec au moins une lettre et un chiffre.',
  },
  roles: {
    title: 'Tu es qui ?',
    subtitle: 'On adapte la suite à ton rôle.',
    player: 'Je suis joueur',
    playerHint: 'Je cherche un club.',
    coach: 'Je suis entraîneur',
    coachHint: "Mon club m'a déjà ajouté et j'ai reçu un code.",
    club: 'Je représente un club',
    clubHint: 'Je crée le compte de mon club.',
  },
  coach: {
    title: 'Active ton compte entraîneur',
    subtitle: 'Saisis l’adresse email que ton club a enregistrée, puis le code reçu.',
    codeLabel: 'Code à 6 chiffres',
    submit: 'Activer mon compte',
  },
  club: {
    title: 'Créer le compte du club',
    subtitle: 'Ta demande sera validée manuellement avant que le club puisse publier.',
    clubName: 'Nom du club',
    region: 'Association régionale',
    locality: 'Localité',
    note: 'Un mot pour la validation',
    notePlaceholder: 'Ton rôle dans le club, un lien vers le site, un contact…',
    submit: 'Envoyer la demande',
    pendingTitle: 'Demande envoyée',
    pendingBody:
      'Ton club est en attente de validation. Confirme ton adresse email en attendant — tu recevras un message dès que le club sera validé.',
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
    codeFormat: 'Le code fait 6 chiffres.',
    inviteInvalid: 'Email ou code incorrect. Vérifie l’adresse enregistrée par ton club.',
    inviteLocked: 'Trop de tentatives. Demande à ton club de renvoyer un code.',
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
  google: {
    signIn: 'Mit Google fortfahren',
    separator: 'oder',
    needsDevBuild:
      'Google Sign-In funktioniert nicht in Expo Go: dafür braucht es einen Development Build. Nutze so lange E-Mail und Passwort.',
    failed: 'Die Google-Anmeldung ist fehlgeschlagen.',
  },
  coachInvite: {
    title: 'Willkommen in deinem Verein',
    subtitle: 'Wähle dein Passwort, um dein Trainerkonto zu aktivieren.',
    submit: 'Konto aktivieren',
    missingToken: 'Dieser Einladungslink ist unvollständig. Öffne ihn erneut aus deiner E-Mail.',
  },
  register: {
    title: 'Komm zu FootLink',
    subtitle: 'Zwei Minuten, und dein Profil ist online.',
    submit: 'Konto erstellen',
    hasAccount: 'Bereits registriert?',
    passwordHint: 'Mindestens 8 Zeichen, mit mindestens einem Buchstaben und einer Ziffer.',
  },
  roles: {
    title: 'Wer bist du?',
    subtitle: 'Wir passen den Rest an deine Rolle an.',
    player: 'Ich bin Spieler',
    playerHint: 'Ich suche einen Verein.',
    coach: 'Ich bin Trainer',
    coachHint: 'Mein Verein hat mich bereits hinzugefügt, ich habe einen Code erhalten.',
    club: 'Ich vertrete einen Verein',
    clubHint: 'Ich erstelle das Konto meines Vereins.',
  },
  coach: {
    title: 'Aktiviere dein Trainerkonto',
    subtitle: 'Gib die E-Mail-Adresse ein, die dein Verein hinterlegt hat, dann den Code.',
    codeLabel: '6-stelliger Code',
    submit: 'Konto aktivieren',
  },
  club: {
    title: 'Vereinskonto erstellen',
    subtitle: 'Dein Antrag wird manuell geprüft, bevor der Verein etwas veröffentlichen kann.',
    clubName: 'Name des Vereins',
    region: 'Regionalverband',
    locality: 'Ort',
    note: 'Ein Wort zur Prüfung',
    notePlaceholder: 'Deine Rolle im Verein, ein Link zur Website, ein Kontakt…',
    submit: 'Antrag senden',
    pendingTitle: 'Antrag gesendet',
    pendingBody:
      'Dein Verein wartet auf die Freigabe. Bestätige in der Zwischenzeit deine E-Mail-Adresse — du wirst benachrichtigt, sobald der Verein freigegeben ist.',
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
    codeFormat: 'Der Code besteht aus 6 Ziffern.',
    inviteInvalid: 'E-Mail oder Code ist falsch. Prüfe die von deinem Verein hinterlegte Adresse.',
    inviteLocked: 'Zu viele Versuche. Bitte deinen Verein, einen neuen Code zu senden.',
  },
};

export type Messages = typeof fr;
