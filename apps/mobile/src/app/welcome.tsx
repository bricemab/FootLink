import { useRouter } from 'expo-router';
import { MotiText, MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { LocaleSwitch } from '@/ui/locale-switch';
import { PitchBackdrop } from '@/ui/pitch-backdrop';
import { PrimaryButton } from '@/ui/primary-button';

export default function Welcome(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <PitchBackdrop>
      {/* Tout en haut : c'est le premier écran, et quelqu'un qui ne lit pas la
          langue affichée doit pouvoir en changer sans rien comprendre d'autre. */}
      <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 200 }}>
        <LocaleSwitch />
      </MotiView>

      <YStack flex={1} justifyContent="flex-end" paddingBottom="$6" gap="$5">
        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 520 }}
        >
          <Text fontSize={13} fontWeight="700" letterSpacing={3} color="$brandPitchBright">
            FOOTLINK
          </Text>
        </MotiView>

        <MotiText
          from={{ opacity: 0, translateY: 28 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 620, delay: 120 }}
          style={{
            fontSize: 40,
            lineHeight: 44,
            fontWeight: '800',
            color: '#F4FBF7',
            letterSpacing: -0.8,
          }}
        >
          {t.welcome.tagline}
        </MotiText>

        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 620, delay: 280 }}
        >
          <Text fontSize={16} lineHeight={23} color="$brandChalkDim">
            {t.welcome.subtitle}
          </Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 520, delay: 400 }}
        >
          <YStack gap="$3" marginTop="$2">
            <PrimaryButton label={t.welcome.signUp} onPress={() => router.push('/register')} />
            <PrimaryButton
              label={t.welcome.signIn}
              variant="ghost"
              onPress={() => router.push('/login')}
            />
          </YStack>
        </MotiView>
      </YStack>
    </PitchBackdrop>
  );
}
