import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

/**
 * Pile des annonces.
 *
 * Comme les équipes et les entraîneurs : sans ce layout, chaque fichier du
 * dossier deviendrait un onglet. La pile est retirée de la barre par
 * `href: null` dans le layout de l'espace club — on y entre depuis une équipe.
 */
export default function ListingsLayout(): ReactNode {
  return <Stack screenOptions={{ headerShown: false }} />;
}
