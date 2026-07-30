import { Stack } from 'expo-router';
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
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
    />
  );
}
