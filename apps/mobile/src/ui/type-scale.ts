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
 * Sept niveaux, et pas un de plus. Chacun a un emploi, et deux niveaux voisins
 * sont séparés d'au moins 15 % — en dessous, la différence ne se lit pas.
 *
 * ⚠️ Il y en avait six. Le balayage des 196 tailles écrites à la main a montré
 * un besoin RÉCURRENT autour de 22 — titre de feuille modale, nom mis en
 * vedette — qui n'entrait bien ni dans `title` (29, trop imposant dans une
 * feuille) ni dans `heading` (19, qui ne se distingue plus du reste). Forcer
 * l'un des deux aurait produit exactement ce qu'on corrige. Un niveau ajouté
 * parce que l'usage le réclame vaut mieux qu'une échelle propre sur le papier.
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
  /** Le titre d'une feuille modale, ou un nom mis en vedette. */
  subtitle: { fontSize: 22, lineHeight: 27, fontWeight: '800', letterSpacing: -0.4 },
  /** Le titre d'une carte, d'une ligne, d'un bloc. */
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
