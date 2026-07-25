import type { AppLocale, Poste } from './enums';

/**
 * Libellés et disposition des postes.
 *
 * Les **codes** viennent des enums Prisma (source unique de vérité) ; les
 * **libellés FR/DE** et la **ligne** viennent de `nomenclature_football_suisse.json`
 * (`postes.items`), recopiés ici parce que le mobile ne peut lire ni le schéma
 * Prisma ni un JSON à la racine du dépôt. Même compromis assumé que
 * `enums.ts` — un codegen depuis le JSON est prévu au durcissement.
 *
 * `ligne` est fournie par la nomenclature elle-même (« hiérarchie via ligne ») :
 * c'est ce qui permet de dessiner les postes à leur vraie place sur un terrain,
 * plutôt que de les empiler dans une liste déroulante.
 */
export type PosteLine = 'gardien' | 'defense' | 'milieu' | 'attaque';

interface PosteMeta {
  line: PosteLine;
  fr: string;
  de: string;
  /**
   * Position sur un demi-terrain vu de dessus, en pourcentage.
   * `x` = 0 à gauche, 100 à droite · `y` = 0 au but défendu, 100 vers l'attaque.
   */
  x: number;
  y: number;
}

export const POSTE_META: Record<Poste, PosteMeta> = {
  GARDIEN: { line: 'gardien', fr: 'Gardien', de: 'Torhüter', x: 50, y: 6 },
  /**
   * Trois axiaux, parce que la charnière dépend du système : un axial unique à
   * trois derrière, un droitier et un gaucher à quatre. Les trois cohabitent sur
   * la même ligne, le joueur prend celui qui décrit son poste.
   */
  DEFENSEUR_CENTRAL: {
    line: 'defense',
    fr: 'Défenseur central',
    de: 'Innenverteidiger',
    x: 50,
    y: 26,
  },
  DEFENSEUR_CENTRAL_DROIT: {
    line: 'defense',
    fr: 'Défenseur central droit',
    de: 'Innenverteidiger rechts',
    x: 67,
    y: 26,
  },
  DEFENSEUR_CENTRAL_GAUCHE: {
    line: 'defense',
    fr: 'Défenseur central gauche',
    de: 'Innenverteidiger links',
    x: 33,
    y: 26,
  },
  LATERAL_DROIT: { line: 'defense', fr: 'Latéral droit', de: 'Rechtsverteidiger', x: 84, y: 30 },
  LATERAL_GAUCHE: { line: 'defense', fr: 'Latéral gauche', de: 'Linksverteidiger', x: 16, y: 30 },
  MILIEU_DEFENSIF: {
    line: 'milieu',
    fr: 'Milieu défensif',
    de: 'Defensives Mittelfeld',
    x: 50,
    y: 45,
  },
  MILIEU_CENTRAL: {
    line: 'milieu',
    fr: 'Milieu central',
    de: 'Zentrales Mittelfeld',
    // Central, donc au centre : décalé, il se lisait comme une erreur de rendu
    // puisque rien ne lui répond de l'autre côté de l'axe.
    x: 50,
    y: 56,
  },
  // Les couloirs du milieu, à la hauteur du milieu central : un milieu droit
  // n'est pas un ailier droit, qui joue une ligne plus haut.
  MILIEU_DROIT: { line: 'milieu', fr: 'Milieu droit', de: 'Rechtes Mittelfeld', x: 84, y: 56 },
  MILIEU_GAUCHE: { line: 'milieu', fr: 'Milieu gauche', de: 'Linkes Mittelfeld', x: 16, y: 56 },
  MILIEU_OFFENSIF: {
    line: 'milieu',
    fr: 'Milieu offensif',
    de: 'Offensives Mittelfeld',
    x: 50,
    y: 68,
  },
  AILIER_DROIT: { line: 'attaque', fr: 'Ailier droit', de: 'Rechtsaussen', x: 85, y: 78 },
  AILIER_GAUCHE: { line: 'attaque', fr: 'Ailier gauche', de: 'Linksaussen', x: 15, y: 78 },
  ATTAQUANT: { line: 'attaque', fr: 'Attaquant', de: 'Stürmer', x: 50, y: 90 },
};

/** Libellé d'un poste dans la langue de l'utilisateur. */
export function posteLabel(poste: Poste, locale: AppLocale): string {
  const meta = POSTE_META[poste];
  return locale === 'DE' ? meta.de : meta.fr;
}
