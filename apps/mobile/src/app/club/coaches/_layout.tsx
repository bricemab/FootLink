import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

/** Pile des entraîneurs. Même raison que pour les équipes : `new` n'est pas un onglet. */
/*
 * 🔴 `contentStyle` transparent, sinon le décor disparaît dans cet onglet.
 *
 * Une pile de react-navigation peint le fond de ses cartes avec la couleur du
 * thème. Ce fond recouvrait les halos posés par `BackdropRoot` — d'où un onglet
 * au fond plat quand les voisins avaient le décor. Le `sceneStyle` du navigateur
 * d'onglets ne suffit pas : il ne concerne que le conteneur, pas les cartes de
 * la pile qui vit dedans.
 */
export default function CoachesLayout(): ReactNode {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
    />
  );
}
