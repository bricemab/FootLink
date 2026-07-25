import type { AppLocale, CategoryCode } from './enums';

/**
 * Libellés FR/DE des catégories.
 *
 * Mêmes règles que `postes.ts` : les **codes** viennent des enums Prisma, les
 * **libellés** de `nomenclature_football_suisse.json` (`ligues_actifs`,
 * `categories_juniors`, `categories_seniors`, `ligues_feminines`), recopiés ici
 * parce que le mobile ne lit ni le schéma ni un JSON à la racine.
 *
 * ⚠️ Ce fichier ne dit **rien** de quelle année de naissance correspond à quelle
 * catégorie : cette correspondance change chaque saison et se calcule
 * uniquement via `getEligibleCategories` (AGENTS §5). Ne jamais coder une année
 * en dur ici.
 */
const CATEGORY_LABELS: Record<CategoryCode, { fr: string; de: string }> = {
  PREMIERE_LIGUE: { fr: '1re ligue', de: '1. Liga' },
  DEUXIEME_LIGUE_INTER: { fr: '2e ligue interrégionale', de: '2. Liga interregional' },
  DEUXIEME_LIGUE: { fr: '2e ligue', de: '2. Liga' },
  TROISIEME_LIGUE: { fr: '3e ligue', de: '3. Liga' },
  QUATRIEME_LIGUE: { fr: '4e ligue', de: '4. Liga' },
  CINQUIEME_LIGUE: { fr: '5e ligue', de: '5. Liga' },
  JUNIORS_A: { fr: 'Juniors A', de: 'Junioren A' },
  JUNIORS_B: { fr: 'Juniors B', de: 'Junioren B' },
  JUNIORS_C: { fr: 'Juniors C', de: 'Junioren C' },
  JUNIORS_D: { fr: 'Juniors D', de: 'Junioren D' },
  JUNIORS_E: { fr: 'Juniors E', de: 'Junioren E' },
  JUNIORS_F: { fr: 'Juniors F', de: 'Junioren F' },
  JUNIORS_G: { fr: 'Juniors G (Bambini)', de: 'Junioren G (Bambini)' },
  SENIORS_30: { fr: 'Seniors 30+', de: 'Senioren 30+' },
  SENIORS_40: { fr: 'Seniors 40+', de: 'Senioren 40+' },
  SENIORS_50: { fr: 'Seniors 50+', de: 'Senioren 50+' },
  PREMIERE_LIGUE_F: { fr: '1re ligue féminine', de: '1. Liga Frauen' },
  DEUXIEME_LIGUE_F: { fr: '2e ligue féminine', de: '2. Liga Frauen' },
  TROISIEME_LIGUE_F: { fr: '3e ligue féminine', de: '3. Liga Frauen' },
  QUATRIEME_LIGUE_F: { fr: '4e ligue féminine', de: '4. Liga Frauen' },
};

export function categoryLabel(category: CategoryCode, locale: AppLocale): string {
  const entry = CATEGORY_LABELS[category];
  return locale === 'DE' ? entry.de : entry.fr;
}
