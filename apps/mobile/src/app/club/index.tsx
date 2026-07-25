import { AERIAL_ATTRIBUTION, regionForCanton } from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { getMyClub, type MyClubResponse } from '@/api/clubs';
import { listCoaches } from '@/api/coaches';
import { listMyTeams } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Vue de supervision du club.
 *
 * Deux états, pas un : tant que le club n'est pas `APPROVED`, l'API refuse
 * équipes et entraîneurs (`canOperate: false`). L'écran l'annonce **avant** de
 * proposer quoi que ce soit, plutôt que de laisser la personne buter sur un 403
 * — c'est la garde d'AGENTS §4bis rendue lisible.
 *
 * Les décomptes sont lus depuis les mêmes listes que les écrans dédiés : aucun
 * endpoint de statistiques à maintenir, et jamais deux chiffres qui divergent.
 */
export default function ClubHome(): ReactNode {
  const router = useRouter();
  const { t, fill } = useI18n();
  const { authed, signOut } = useAuth();

  const [club, setClub] = useState<MyClubResponse | null>(null);
  const [teamCount, setTeamCount] = useState<number>();
  const [coachCount, setCoachCount] = useState<number>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    try {
      const mine = await authed((token) => getMyClub(token));
      setClub(mine);
      if (mine?.canOperate !== true) {
        // Inutile de demander équipes et entraîneurs : l'API répondrait 403.
        setTeamCount(undefined);
        setCoachCount(undefined);
        return;
      }
      const [teams, coaches] = await Promise.all([
        authed((token) => listMyTeams(token)),
        authed((token) => listCoaches(token)),
      ]);
      setTeamCount(teams.length);
      setCoachCount(coaches.length);
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = club ? statusLabel(club.club.status, t) : '';
  const canOperate = club?.canOperate === true;
  const region = club?.club.regionCode ?? regionForCanton(club?.club.canton ?? '');

  return (
    <AppScreen
      title={club?.club.name ?? t.clubSpace.title}
      subtitle={placeLine(club) ?? undefined}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {loading && !club ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {club ? (
        <>
          <Card accent={canOperate}>
            {/* La vue du ciel identifie le terrain d'un coup d'oeil, bien mieux
                qu'une ligne d'adresse. Absente si le club n'a pas de point. */}
            {club.aerialUrl ? (
              <YStack gap="$1" marginBottom="$1">
                <YStack height={150} borderRadius={14} overflow="hidden">
                  <Image
                    source={{ uri: club.aerialUrl }}
                    style={{ width: '100%', height: 150 }}
                    resizeMode="cover"
                    accessibilityLabel={t.clubSpace.pitchLabel}
                  />
                </YStack>
                {/* Mention obligatoire : l'URL est generee avec
                    `logo=false&attribution=false`, ce que Mapbox n'autorise QUE
                    si l'attribution figure ailleurs dans l'interface. Sans cette
                    ligne, l'ecran sort des conditions d'utilisation. */}
                <Text fontSize={10} color="rgba(169,196,184,0.55)">
                  {AERIAL_ATTRIBUTION}
                </Text>
              </YStack>
            ) : null}

            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <Text fontSize={13} fontWeight="700" letterSpacing={0.5} color="$brandChalkDim">
                {t.clubSpace.pitchLabel.toUpperCase()}
              </Text>
              <Badge label={status} tone={canOperate ? 'accent' : 'warning'} />
            </XStack>
            <Text fontSize={15} color="$brandChalk">
              {club.club.stadiumName ?? club.club.addressLine ?? t.clubSpace.noPitch}
            </Text>
            {region ? (
              <Text fontSize={13} color="$brandChalkDim">
                {region.toUpperCase()}
              </Text>
            ) : null}
          </Card>

          {!canOperate ? (
            <FormBanner message={t.clubSpace.pendingNotice} />
          ) : (
            <>
              <Card onPress={() => router.push('/club/teams')}>
                <XStack alignItems="center" justifyContent="space-between" gap="$3">
                  <Text fontSize={17} fontWeight="700" color="$brandChalk">
                    {t.clubSpace.teams}
                  </Text>
                  <Text fontSize={15} fontWeight="700" color="$brandPitchBright">
                    {teamCount === undefined
                      ? '—'
                      : fill(t.clubSpace.countTeams, { count: String(teamCount) })}
                  </Text>
                </XStack>
                <Text fontSize={13.5} color="$brandChalkDim">
                  {t.clubSpace.teamsHint}
                </Text>
              </Card>

              <Card onPress={() => router.push('/club/coaches')}>
                <XStack alignItems="center" justifyContent="space-between" gap="$3">
                  <Text fontSize={17} fontWeight="700" color="$brandChalk">
                    {t.clubSpace.coaches}
                  </Text>
                  <Text fontSize={15} fontWeight="700" color="$brandPitchBright">
                    {coachCount === undefined
                      ? '—'
                      : fill(t.clubSpace.countCoaches, { count: String(coachCount) })}
                  </Text>
                </XStack>
                <Text fontSize={13.5} color="$brandChalkDim">
                  {t.clubSpace.coachesHint}
                </Text>
              </Card>
            </>
          )}

          {club.club.websiteUrl ? (
            <Card>
              <Text fontSize={13} fontWeight="700" letterSpacing={0.5} color="$brandChalkDim">
                {t.clubSpace.website.toUpperCase()}
              </Text>
              <Text fontSize={15} color="$brandChalk">
                {club.club.websiteUrl}
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      <PrimaryButton
        label={t.common.logout}
        variant="ghost"
        onPress={() => {
          void signOut().then(() => router.replace('/'));
        }}
      />
    </AppScreen>
  );
}

/** Adresse lisible du club, ou `null` s'il n'en a aucune. */
function placeLine(club: MyClubResponse | null): string | null {
  if (!club?.club.locality) {
    return null;
  }
  return club.club.canton ? `${club.club.locality} (${club.club.canton})` : club.club.locality;
}

function statusLabel(
  status: MyClubResponse['club']['status'],
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (status) {
    case 'APPROVED':
      return t.clubSpace.statusApproved;
    case 'REJECTED':
      return t.clubSpace.statusRejected;
    case 'SUSPENDED':
      return t.clubSpace.statusSuspended;
    default:
      return t.clubSpace.statusPending;
  }
}
