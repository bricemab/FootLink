import type { AppLocale } from '@footlink/shared';
import { MotiView } from 'moti';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { updateMyLocale } from '@/api/users';
import { useAuth } from '@/auth/auth-context';
import { loadTokens } from '@/auth/token-storage';
import { AVAILABLE_LOCALES, useI18n } from '@/i18n';
import { TYPE } from '@/ui/type-scale';

/**
 * Sélecteur de langue.
 *
 * Le choix vit d'abord sur l'appareil — on change souvent de langue **avant**
 * d'avoir un compte. Dès qu'une session existe, il est poussé en base, car
 * c'est `User.locale` qui décide de la langue des emails et des notifications,
 * envoyés alors que l'app est fermée.
 */
export function LocaleSwitch(): ReactNode {
  const { locale, setLocale } = useI18n();
  const { phase, user } = useAuth();
  const lastPushed = useRef<AppLocale | null>(null);

  // Après une connexion, la préférence de l'appareil fait foi : c'est le
  // dernier choix explicite de l'utilisateur.
  useEffect(() => {
    if (phase !== 'signedIn' || !user || user.locale === locale || lastPushed.current === locale) {
      return;
    }
    lastPushed.current = locale;
    void (async () => {
      const tokens = await loadTokens();
      if (tokens) {
        await updateMyLocale(tokens.accessToken, locale).catch(() => {
          // Hors ligne : on retentera au prochain changement ou au prochain
          // lancement, l'affichage reste correct entre-temps.
          lastPushed.current = null;
        });
      }
    })();
  }, [phase, user, locale]);

  return (
    <XStack
      alignSelf="flex-end"
      padding="$1"
      borderRadius={14}
      backgroundColor="rgba(14,36,28,0.7)"
      borderWidth={1}
      borderColor="rgba(244,251,247,0.14)"
    >
      {AVAILABLE_LOCALES.map((option) => {
        const active = option === locale;
        return (
          <Pressable
            key={option}
            onPress={() => setLocale(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <MotiView
              animate={{ backgroundColor: active ? '#39FF88' : 'transparent' }}
              transition={{ type: 'timing', duration: 180 }}
              style={{ borderRadius: 11, paddingHorizontal: 14, paddingVertical: 7 }}
            >
              <Text
                {...TYPE.meta}
                fontWeight="700"
                color={active ? '$brandNight' : '$brandChalkDim'}
              >
                {option}
              </Text>
            </MotiView>
          </Pressable>
        );
      })}
    </XStack>
  );
}
