/**
 * Le mouvement des piles, décidé une fois pour toutes.
 *
 * 🔴 **Un mouvement doit dire quelque chose.** Les quatre piles imbriquées
 * (`teams`, `listings`, `coaches`, `players`) ne déclaraient aucune animation :
 * chacune héritait du défaut de la plateforme, ce qui n'est pas un choix mais
 * une absence de choix — et ce défaut change avec la version de
 * `react-native-screens`. Ici la règle est écrite : **on entre par la droite**,
 * parce qu'on descend dans une hiérarchie, et on ressort par où l'on est venu.
 * C'est ce qui fait qu'on sait toujours où l'on est sans lire le titre.
 *
 * `animationDuration` volontairement court : 260 ms se sent comme une réponse,
 * 350 ms comme une attente. C'est la fourchette où une transition passe de
 * « l'app est soignée » à « l'app est lente ».
 *
 * ⚠️ **Pas de transition d'élément partagé.** Elle donnerait l'effet le plus
 * spectaculaire — la carte qui devient l'écran — mais l'API de Reanimated est
 * encore expérimentale, et ce projet a déjà payé un « FootLink isn't
 * responding » sur une animation trop ambitieuse (cf. `pitch-backdrop.tsx`).
 * On garde des animations natives, que le système compose sans nous.
 *
 * ⚠️ **`contentStyle` transparent, et il n'est pas négociable.** Une pile de
 * react-navigation peint le fond de ses cartes avec la couleur du thème, ce qui
 * recouvrait les halos posés par `BackdropRoot` — d'où un onglet au fond plat
 * quand ses voisins avaient le décor. Le `sceneStyle` du navigateur d'onglets
 * ne suffit pas : il ne concerne que le conteneur, pas les cartes de la pile
 * qui vit dedans.
 */
/*
  Pas d'annotation de type : `@react-navigation/native-stack` n'est pas une
  dependance DIRECTE de l'app (elle arrive par expo-router), donc l'importer
  pour un type marcherait aujourd'hui et casserait au prochain hissage. L'objet
  litteral se verifie de toute facon a l'endroit ou il est passe a `<Stack>`.
*/
export const STACK_SCREEN_OPTIONS = {
  headerShown: false,
  // `as const` sur la valeur : sans lui, TypeScript elargit 'slide_from_right'
  // en `string`, que `<Stack>` refuse — il attend une des animations connues.
  animation: 'slide_from_right' as const,
  animationDuration: 260,
  contentStyle: { backgroundColor: 'transparent' },
};
