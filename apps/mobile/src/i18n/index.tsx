import type { AppLocale } from '@footlink/shared';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { de, fr, type Messages } from './messages';
import { loadStoredLocale, storeLocale } from './storage';

// IT est prévu dans l'enum côté API mais non activé : repli FR (cf. AGENTS §9).
const CATALOGS: Partial<Record<AppLocale, Messages>> = { FR: fr, DE: de };

/** Langues réellement proposées dans l'app. */
export const AVAILABLE_LOCALES: AppLocale[] = ['FR', 'DE'];

export function resolveDeviceLocale(): AppLocale {
  const primary = getLocales()[0]?.languageCode?.toUpperCase();
  return primary === 'DE' ? 'DE' : 'FR';
}

interface I18nValue {
  locale: AppLocale;
  t: Messages;
  /** Change la langue et la conserve sur l'appareil. */
  setLocale: (locale: AppLocale) => void;
  /** Remplace les jetons `{clé}` d'un libellé. */
  fill: (template: string, values: Record<string, string>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  // On démarre sur la langue de l'appareil, puis on adopte la préférence
  // enregistrée dès qu'elle est lue : la lecture est asynchrone, et attendre
  // afficherait un écran vide au lancement.
  const [locale, setLocaleState] = useState<AppLocale>(resolveDeviceLocale);

  useEffect(() => {
    let cancelled = false;
    void loadStoredLocale().then((stored) => {
      if (!cancelled && stored) {
        setLocaleState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    void storeLocale(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: CATALOGS[locale] ?? fr,
      setLocale,
      fill: (template, values) =>
        Object.entries(values).reduce(
          (text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement),
          template,
        ),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n doit être utilisé dans un I18nProvider.');
  }
  return value;
}
