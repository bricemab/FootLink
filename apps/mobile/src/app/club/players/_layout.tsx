import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/ui/stack-options';
import type { ReactNode } from 'react';

/**
 * Pile des fiches joueur.
 *
 * `contentStyle` transparent, comme les autres piles de l'espace club : sans
 * lui, react-native-screens peint le fond de ses cartes et le decor disparait
 * dans cet onglet (cf. `club/_layout.tsx`).
 */
export default function PlayersLayout(): ReactNode {
  return (
    <Stack
      // Le mouvement est decide dans `stack-options` : quatre piles qui le
      // redeclarent chacune finissent par ne plus bouger pareil.
      screenOptions={STACK_SCREEN_OPTIONS}
    />
  );
}
