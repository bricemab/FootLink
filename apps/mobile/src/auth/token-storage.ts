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
    await Promise.all([removeItem(ACCESS_KEY), removeItem(REFRESH_KEY)]);
  } catch {
    // Rien à faire : la session en mémoire est déjà oubliée par l'appelant.
  }
}
