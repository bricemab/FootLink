import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import { AuthProvider } from '@/auth/auth-context';
import { I18nProvider } from '@/i18n';
import config from '../../tamagui.config';

void SplashScreen.preventAutoHideAsync();

/**
 * Racine de l'app. L'ordre des providers compte : Tamagui doit envelopper tout
 * ce qui rend de l'UI, et l'auth doit être disponible pour la garde de routage
 * de `index.tsx`.
 *
 * Thème forcé en sombre au M0 : l'identité visuelle est nocturne et le thème
 * clair n'a pas encore été dessiné (cf. HANDOFF).
 */
export default function RootLayout(): ReactNode {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TamaguiProvider config={config} defaultTheme="dark">
          <I18nProvider>
            <AuthProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                  contentStyle: { backgroundColor: '#07130F' },
                }}
              />
            </AuthProvider>
          </I18nProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
