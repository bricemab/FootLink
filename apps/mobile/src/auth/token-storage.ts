import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthTokens } from '@/api/auth';

/**
 * Stockage des jetons.
 *
 * Sur iOS et Android : Keychain / Keystore via SecureStore — jamais
 * AsyncStorage, lisible en clair sur un appareil rooté.
 *
 * Sur le web : SecureStore n'existe pas. On garde les jetons **en mémoire**
 * plutôt que dans localStorage : le web n'est pas une cible produit (AGENTS §2),
 * il ne sert qu'à inspecter l'UI, et y écrire des jetons persistants serait un
 * recul de sécurité gratuit. Conséquence assumée : la session ne survit pas à
 * un rechargement de page.
 *
 * Toutes les lectures/écritures sont défensives : un stockage sécurisé
 * indisponible doit dégrader vers « pas de session », jamais faire planter
 * l'app au démarrage.
 */
const ACCESS_KEY = 'footlink.accessToken';
const REFRESH_KEY = 'footlink.refreshToken';
/**
 * Le dernier profil connu.
 *
 * 🔴 **Il sert a NE PAS deconnecter quelqu'un qui est simplement hors ligne.**
 * Au demarrage, l'app demandait le profil au serveur et, s'il ne repondait pas,
 * repassait sur l'ecran de connexion — alors que les jetons etaient intacts.
 * Un metro, un ascenseur, un serveur qui redemarre, et la session etait perdue.
 *
 * Effet secondaire heureux : le lancement est instantane. On affiche le profil
 * connu tout de suite, et on le rafraichit derriere.
 *
 * ⚠️ Ce n'est PAS un secret d'authentification — mais il contient des donnees
 * personnelles (email, role), donc il vit au meme endroit que les jetons, dans
 * le stockage chiffre, et il part avec eux a la deconnexion.
 */
const PROFILE_KEY = 'footlink.profile';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

const isWeb = Platform.OS === 'web';
const memoryStore = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return memoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    setItem(ACCESS_KEY, tokens.accessToken),
    setItem(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      getItem(ACCESS_KEY),
      getItem(REFRESH_KEY),
    ]);
    if (!accessToken || !refreshToken) {
      return null;
    }
    return { accessToken, refreshToken };
  } catch {
    // Keystore indisponible : on repart d'une session vide plutôt que
    // d'empêcher l'app de démarrer.
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await Promise.all([
      removeItem(ACCESS_KEY),
      removeItem(REFRESH_KEY),
      removeItem(PROFILE_KEY),
    ]);
  } catch {
    // Rien à faire : la session en mémoire est déjà oubliée par l'appelant.
  }
}

/** Voir `PROFILE_KEY`. Un echec d'ecriture n'est jamais bloquant. */
export async function saveProfile(profile: unknown): Promise<void> {
  try {
    await setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Le cache est un confort : sans lui l'app demarre juste moins vite.
  }
}

/**
 * Le profil en cache.
 *
 * ⚠️ Type de retour `unknown` : ce JSON a ete ecrit par une version
 * POTENTIELLEMENT PLUS ANCIENNE de l'app. Le typer `MeResponse` mentirait — un
 * champ ajoute depuis serait absent, et l'ecran planterait en le lisant. C'est
 * a l'appelant de decider ce qu'il en fait.
 */
export async function loadProfile(): Promise<unknown> {
  try {
    const raw = await getItem(PROFILE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}
