import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/ui/stack-options';
import type { ReactNode } from 'react';

/**
 * Pile des équipes, dans l'onglet du même nom.
 *
 * Sans ce layout, `new` et `[id]` deviendraient des onglets à part entière : la
 * barre du bas en compterait cinq, dont deux qui n'ont de sens qu'en passage.
 */
/*
 * 🔴 `contentStyle` transparent, sinon le décor disparaît dans cet onglet.
 *
 * Une pile de react-navigation peint le fond de ses cartes avec la couleur du
 * thème. Ce fond recouvrait les halos posés par `BackdropRoot` — d'où un onglet
 * au fond plat quand les voisins avaient le décor. Le `sceneStyle` du navigateur
 * d'onglets ne suffit pas : il ne concerne que le conteneur, pas les cartes de
 * la pile qui vit dedans.
 */
export default function TeamsLayout(): ReactNode {
  return (
    <Stack
      // Le mouvement est decide dans `stack-options` : quatre piles qui le
      // redeclarent chacune finissent par ne plus bouger pareil.
      screenOptions={STACK_SCREEN_OPTIONS}
    />
  );
}
