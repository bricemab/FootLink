/**
 * L'échelle typographique de FootLink.
 *
 * 🔴 **Tout était écrit à la main, écran par écran.** `fontSize={30}` ici,
 * `fontSize={32}` là, `13.5` et `14.5` mélangés dans la même carte : des
 * valeurs proches mais jamais identiques, choisies au coup par coup. Le
 * résultat n'est pas laid, il est *plat* — quand deux niveaux ne diffèrent que
 * d'un point, l'œil ne les distingue pas, et plus rien ne ressort. Une
 * hiérarchie ne se voit que si les écarts sont francs.
 *
 * Six niveaux, et pas un de plus. Chacun a un emploi, et deux niveaux voisins
 * sont séparés d'au moins 15 % — en dessous, la différence ne se lit pas.
 *
 * ⚠️ **`lineHeight` fait partie du niveau, pas du réglage local.** C'est lui
 * qui donne le rythme d'un paragraphe ; le laisser au défaut produisait des
 * interlignes serrés sur les titres et lâches sur les légendes, exactement
 * l'inverse de ce qu'il faut.
 *
 * ⚠️ **`letterSpacing` négatif sur les grandes tailles, positif sur les
 * petites.** Une police grossie paraît trop espacée, une police réduite trop
 * serrée : la compensation est une correction optique, pas une coquetterie.
 */
export interface TypeLevel {
  fontSize: number;
  lineHeight: number;
  fontWeight: '600' | '700' | '800' | '900';
  letterSpacing: number;
}

export const TYPE = {
  /** Le moment fort d'un écran, et il n'y en a qu'UN : match, accueil. */
  display: { fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  /** Le titre d'un écran. */
  title: { fontSize: 29, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  /** Le titre d'une carte, d'un bloc. */
  heading: { fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.2 },
  /** Le texte courant. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '600', letterSpacing: 0 },
  /** Une information secondaire : distance, lieu, date. */
  meta: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', letterSpacing: 0.1 },
  /**
   * L'intitulé d'un champ, d'une section. Toujours en capitales — c'est ce qui
   * le distingue du corps de texte sans avoir besoin d'une couleur de plus.
   */
  label: { fontSize: 12.5, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6 },
} as const satisfies Record<string, TypeLevel>;
