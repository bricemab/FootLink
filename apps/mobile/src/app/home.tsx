import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { PitchBackdrop } from '@/ui/pitch-backdrop';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Écran d'atterrissage du M0 : il prouve que la session tient et que l'API
 * répond. Le profil joueur et le feed viennent aux jalons suivants.
 */
export default function Home(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const { user, signOut } = useAuth();

  return (
    <PitchBackdrop>
      <YStack flex={1} justifyContent="center" gap="$5">
        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 160 }}
        >
          <YStack gap="$2">
            <Text fontSize={13} fontWeight="700" letterSpacing={3} color="$brandPitchBright">
              FOOTLINK
            </Text>
            <Text fontSize={34} fontWeight="800" color="$brandChalk" letterSpacing={-0.6}>
              {t.home.title}
            </Text>
            <Text fontSize={16} lineHeight={22} color="$brandChalkDim">
              {t.home.subtitle}
            </Text>
          </YStack>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 18 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 460, delay: 160 }}
        >
          <YStack
            gap="$3"
            padding="$4"
            borderRadius={20}
            backgroundColor="rgba(14,36,28,0.75)"
            borderWidth={1}
            borderColor="rgba(244,251,247,0.12)"
          >
            <InfoRow label={t.common.email} value={user?.email ?? '—'} />
            <InfoRow label={t.home.role} value={user?.role ?? '—'} />
            <InfoRow label={t.home.status} value={user?.status ?? '—'} />
          </YStack>
        </MotiView>

        <PrimaryButton
          label={t.common.logout}
          variant="ghost"
          onPress={() => {
            void signOut().then(() => router.replace('/'));
          }}
        />
      </YStack>
    </PitchBackdrop>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <XStack justifyContent="space-between" alignItems="center" gap="$3">
      <Text fontSize={13} fontWeight="600" letterSpacing={0.4} color="$brandChalkDim">
        {label.toUpperCase()}
      </Text>
      <Text fontSize={15} fontWeight="600" color="$brandChalk" flexShrink={1} textAlign="right">
        {value}
      </Text>
    </XStack>
  );
}
