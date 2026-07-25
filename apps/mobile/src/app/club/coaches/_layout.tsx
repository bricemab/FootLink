import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

/** Pile des entraîneurs. Même raison que pour les équipes : `new` n'est pas un onglet. */
export default function CoachesLayout(): ReactNode {
  return <Stack screenOptions={{ headerShown: false }} />;
}
