import type { AppLocale } from '@footlink/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Préférence de langue, conservée sur l'appareil.
 *
 * Elle doit survivre à un redémarrage **même déconnecté** : la langue se change
 * typiquement avant de créer un compte. On réutilise SecureStore, déjà présent
 * pour les jetons — ce n'est pas un secret, mais ajouter AsyncStorage
 * imposerait un module natif de plus, donc une reconstruction de l'app pour
 * stocker deux lettres. Sur le web, SecureStore n'existe pas : mémoire seule.
 */
const KEY = 'footlink.locale';
const isWeb = Platform.OS === 'web';
let memory: AppLocale | null = null;

export async function loadStoredLocale(): Promise<AppLocale | null> {
  if (isWeb) {
    return memory;
  }
  try {
    const value = await SecureStore.getItemAsync(KEY);
    return value === 'FR' || value === 'DE' ? value : null;
  } catch {
    return null;
  }
}

export async function storeLocale(locale: AppLocale): Promise<void> {
  memory = locale;
  if (isWeb) {
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, locale);
  } catch {
    // Préférence non conservée : on repartira sur la langue de l'appareil.
  }
}
