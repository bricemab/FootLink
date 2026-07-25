import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

/**
 * Pile des équipes, dans l'onglet du même nom.
 *
 * Sans ce layout, `new` et `[id]` deviendraient des onglets à part entière : la
 * barre du bas en compterait cinq, dont deux qui n'ont de sens qu'en passage.
 */
export default function TeamsLayout(): ReactNode {
  return <Stack screenOptions={{ headerShown: false }} />;
}
