import type { AppLocale } from '@footlink/shared';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { de, fr, type Messages } from './messages';

// IT est prévu dans l'enum côté API mais non activé : repli FR (cf. AGENTS §9).
const CATALOGS: Partial<Record<AppLocale, Messages>> = { FR: fr, DE: de };

export function resolveLocale(): AppLocale {
  const primary = getLocales()[0]?.languageCode?.toUpperCase();
  return primary === 'DE' ? 'DE' : 'FR';
}

interface I18nValue {
  locale: AppLocale;
  t: Messages;
  /** Remplace les jetons `{clé}` d'un libellé. */
  fill: (template: string, values: Record<string, string>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const value = useMemo<I18nValue>(() => {
    const locale = resolveLocale();
    return {
      locale,
      t: CATALOGS[locale] ?? fr,
      fill: (template, values) =>
        Object.entries(values).reduce(
          (text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement),
          template,
        ),
    };
  }, []);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n doit être utilisé dans un I18nProvider.');
  }
  return value;
}
