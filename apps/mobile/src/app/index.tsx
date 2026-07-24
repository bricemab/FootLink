import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { YStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';

/**
 * Garde de routage unique.
 *
 * L'ordre reflète la règle serveur : sans email validé, l'API refuse tout —
 * l'app envoie donc l'utilisateur sur l'écran de validation avant tout le reste
 * plutôt que de le laisser se heurter à des 403.
 */
export default function Index(): ReactNode {
  const { phase, user } = useAuth();

  useEffect(() => {
    if (phase !== 'loading') {
      void SplashScreen.hideAsync();
    }
  }, [phase]);

  if (phase === 'loading') {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$brandNight">
        <ActivityIndicator color="#39FF88" />
      </YStack>
    );
  }

  if (phase === 'signedOut' || !user) {
    return <Redirect href="/welcome" />;
  }

  if (!user.emailVerified) {
    // Même route que le lien profond de l'email (footlink://auth/verify-email).
    return <Redirect href="/auth/verify-email" />;
  }

  return <Redirect href="/home" />;
}
