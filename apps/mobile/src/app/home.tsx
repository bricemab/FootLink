import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { getMyClub, type MyClubResponse } from '@/api/clubs';
import { useAuth } from '@/auth/auth-context';
import { loadTokens } from '@/auth/token-storage';
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
  const [club, setClub] = useState<MyClubResponse | null>(null);

  // Un responsable de club doit savoir où en est sa demande : sans ça, l'écran
  // ne lui dit rien et il ne peut de toute façon rien faire tant que le club
  // n'est pas validé.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tokens = await loadTokens();
      if (!tokens) {
        return;
      }
      const result = await getMyClub(tokens.accessToken).catch(() => null);
      if (!cancelled) {
        setClub(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Un joueur n'a pas de club : `club` reste nul et l'écran garde son contenu
  // habituel. Le message d'attente ne concerne qu'un club pas encore validé.
  const pendingClub = club?.canOperate === false;

  return (
    <PitchBackdrop>
      <YStack flex={1} justifyContent="center" gap="$5">
        {/* Aucune animation d'entrée : ses valeurs de départ persistent quand
            elle ne se joue pas. Cf. `StepTransition`. */}
        <YStack gap="$2">
            <Text fontSize={13} fontWeight="700" letterSpacing={3} color="$brandPitchBright">
              FOOTLINK
            </Text>
            <Text fontSize={34} fontWeight="800" color="$brandChalk" letterSpacing={-0.6}>
              {pendingClub ? t.club.pendingTitle : t.home.title}
            </Text>
            <Text fontSize={16} lineHeight={22} color="$brandChalkDim">
              {pendingClub ? t.club.pendingBody : t.home.subtitle}
            </Text>
        </YStack>

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
          {club ? <InfoRow label={club.club.name} value={club.club.status} /> : null}
        </YStack>

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
