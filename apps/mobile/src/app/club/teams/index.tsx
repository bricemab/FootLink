import { categoryLabel } from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { listMyTeams, type Team } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Équipes du club.
 *
 * La liste vient du serveur **déjà filtrée** selon le rôle : tout le club pour
 * un CLUB_ADMIN, seulement ses équipes pour un entraîneur. L'app ne filtre rien
 * — c'est ce qui garantit qu'un entraîneur ne voit pas le reste du club, même si
 * cet écran était réutilisé tel quel.
 */
export default function TeamsList(): ReactNode {
  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [teams, setTeams] = useState<Team[]>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    setLoading(true);
    try {
      setTeams(await authed((token) => listMyTeams(token)));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, t]);

  // `useFocusEffect` serait plus juste, mais recharger au montage suffit ici :
  // la création et l'édition reviennent sur cet écran par un `replace`, qui le
  // remonte. À revoir si un jour on y revient par un simple retour de pile.
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppScreen
      title={t.teams.title}
      subtitle={t.teams.subtitle}
      onBack={() => router.replace('/club')}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {teams === undefined && loading ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {teams !== undefined && teams.length === 0 ? <EmptyState text={t.teams.empty} /> : null}

      {teams?.map((team) => (
        <Card key={team.id} onPress={() => router.push(`/club/teams/${team.id}`)}>
          <XStack alignItems="center" justifyContent="space-between" gap="$3">
            <Text fontSize={17} fontWeight="700" color="$brandChalk" flexShrink={1}>
              {team.name ?? categoryLabel(team.category, locale)}
            </Text>
            <Badge
              label={fill(t.teams.listings, { count: String(team.listingCount) })}
              tone={team.listingCount > 0 ? 'accent' : 'neutral'}
            />
          </XStack>

          {/* Le nom libre ne remplace pas la catégorie : c'est elle qui décide
              qui pourra postuler, donc elle reste toujours visible. */}
          {team.name ? (
            <Text fontSize={13.5} color="$brandChalkDim">
              {categoryLabel(team.category, locale)}
            </Text>
          ) : null}

          <Text fontSize={14} color={team.coaches.length > 0 ? '$brandChalk' : '$brandChalkDim'}>
            {team.coaches.length === 0
              ? t.teams.noCoach
              : team.coaches.map((coach) => coachName(coach)).join(' · ')}
          </Text>
        </Card>
      ))}

      <PrimaryButton label={t.teams.add} onPress={() => router.push('/club/teams/new')} />
    </AppScreen>
  );
}

/**
 * Nom affichable d'un entraîneur. Prénom et nom viennent de `ClubMember` — c'est
 * le club qui les a saisis — et peuvent manquer sur un compte ancien : on retombe
 * alors sur l'adresse, jamais sur du vide.
 */
function coachName(coach: Team['coaches'][number]): string {
  const full = [coach.firstName, coach.lastName].filter(Boolean).join(' ').trim();
  return full.length > 0 ? full : coach.email;
}
