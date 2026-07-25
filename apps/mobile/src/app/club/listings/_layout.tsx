import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

/**
 * Pile des annonces.
 *
 * Comme les équipes et les entraîneurs : sans ce layout, chaque fichier du
 * dossier deviendrait un onglet — `new` et `[id]` en particulier, qui sont des
 * écrans de la pile, pas des destinations. Seul `index` est l'onglet.
 */
export default function ListingsLayout(): ReactNode {
  return <Stack screenOptions={{ headerShown: false }} />;
}
