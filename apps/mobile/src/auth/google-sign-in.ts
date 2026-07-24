import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Google Sign-In natif.
 *
 * Le module est natif : il n'existe PAS dans Expo Go, qui embarque un jeu fixe
 * de modules. Il faut un *development build* (`eas build --profile development`).
 * On détecte le cas plutôt que de laisser l'app planter sur un module absent.
 *
 * Le jeton ID obtenu ici n'est jamais cru sur parole : le serveur revérifie sa
 * signature et son audience (`POST /auth/google`).
 */

// Identifiants OAuth publics (projet Google Cloud `footlink-503320`).
// Ce ne sont pas des secrets : ils sont de toute façon lisibles dans le binaire.
const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '988726398910-5g4vq425rtibek5jg3rjpuap6mquglo9.apps.googleusercontent.com';
const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  '988726398910-pu1ivi7aoamal3sstohtqr8qdnp8j38d.apps.googleusercontent.com';

export type GoogleSignInFailure =
  | 'NEEDS_DEV_BUILD'
  | 'NOT_CONFIGURED'
  | 'CANCELLED'
  | 'NO_ID_TOKEN'
  | 'FAILED';

export class GoogleSignInError extends Error {
  readonly reason: GoogleSignInFailure;

  constructor(reason: GoogleSignInFailure, cause?: unknown) {
    super(reason);
    this.name = 'GoogleSignInError';
    this.reason = reason;
    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }
}

/** Expo Go n'embarque pas ce module natif : le bouton doit l'annoncer, pas planter. */
export function isGoogleSignInAvailable(): boolean {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

interface GoogleModule {
  GoogleSignin: {
    configure: (options: { webClientId: string; iosClientId: string }) => void;
    hasPlayServices: (options?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>;
    signIn: () => Promise<unknown>;
    signOut: () => Promise<void>;
  };
}

// Chargement paresseux : un `import` statique ferait échouer le bundle au
// démarrage dans Expo Go, avant même d'atteindre l'écran de connexion.
function loadModule(): GoogleModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as GoogleModule;
}

let configured = false;

function readIdToken(result: unknown): string | null {
  // La v13+ renvoie { type, data: { idToken } } ; les versions antérieures
  // renvoyaient l'objet utilisateur à plat. On accepte les deux formes.
  const candidate = result as { data?: { idToken?: string | null }; idToken?: string | null };
  return candidate.data?.idToken ?? candidate.idToken ?? null;
}

export async function getGoogleIdToken(): Promise<string> {
  if (!isGoogleSignInAvailable()) {
    throw new GoogleSignInError('NEEDS_DEV_BUILD');
  }

  let result: unknown;
  try {
    const { GoogleSignin } = loadModule();
    if (!configured) {
      GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
      configured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    result = await GoogleSignin.signIn();
  } catch (error) {
    const code = String((error as { code?: string | number }).code ?? '');
    // Annuler n'est pas une erreur : l'écran ne doit rien afficher de rouge.
    if (code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501') {
      throw new GoogleSignInError('CANCELLED', error);
    }
    // DEVELOPER_ERROR (code 10 sur Android) ne veut PAS dire que la connexion a
    // échoué : il veut dire que Google ne reconnaît pas cette application. En
    // pratique, toujours la même cause — pas de client OAuth Android pour ce
    // couple (package, empreinte SHA-1). Message générique = une heure perdue à
    // chercher au mauvais endroit.
    if (code === 'DEVELOPER_ERROR' || code === '10') {
      throw new GoogleSignInError('NOT_CONFIGURED', error);
    }
    throw new GoogleSignInError('FAILED', error);
  }

  const idToken = readIdToken(result);
  if (!idToken) {
    throw new GoogleSignInError('NO_ID_TOKEN');
  }
  return idToken;
}

export async function googleSignOut(): Promise<void> {
  if (!isGoogleSignInAvailable()) {
    return;
  }
  try {
    await loadModule().GoogleSignin.signOut();
  } catch {
    // Déconnexion locale déjà faite : l'état Google résiduel n'est pas bloquant.
  }
}
