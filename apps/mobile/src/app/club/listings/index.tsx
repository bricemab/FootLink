import { posteLabel } from '@footlink/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { listMyListings, type Listing } from '@/api/listings';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { statusLabel, statusTone } from '@/ui/listing-status';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Annonces d'une équipe.
 *
 * Elles vivent **dans l'équipe** et non dans un onglet à part : une annonce
 * appartient à une équipe, et un onglet global obligerait à redemander
 * « laquelle ? » à chaque création.
 *
 * La liste est filtrée par le serveur selon le rôle — un entraîneur ne voit que
 * ses équipes. L'app ne filtre rien.
 */
export default function TeamListings(): ReactNode {
  const router = useRouter();
  // `teamId` en paramètre de requête : les annonces vivent dans leur propre
  // pile, pas sous `teams/[id]/` — `[id].tsx` et `[id]/` entreraient en conflit
  // dans expo-router.
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [listings, setListings] = useState<Listing[]>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!teamId) {
      return;
    }
    setBanner(undefined);
    setLoading(true);
    try {
      setListings(await authed((token) => listMyListings(token, { teamId })));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, teamId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppScreen
      title={t.listings.title}
      subtitle={t.listings.subtitle}
      onBack={() => router.replace({ pathname: '/club/teams/[id]', params: { id: teamId } })}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {listings === undefined && loading ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {listings !== undefined && listings.length === 0 ? (
        <EmptyState text={t.listings.empty} />
      ) : null}

      {listings?.map((listing) => (
        <Card
          key={listing.id}
          accent={listing.status === 'ACTIVE'}
          onPress={() => router.push({ pathname: '/club/listings/[id]', params: { id: listing.id } })}
        >
          <XStack alignItems="center" justifyContent="space-between" gap="$3">
            <Text fontSize={17} fontWeight="700" color="$brandChalk" flexShrink={1}>
              {posteLabel(listing.posteRecherche, locale)}
            </Text>
            <Badge label={statusLabel(listing.status, t)} tone={statusTone(listing.status)} />
          </XStack>

          {listing.secondaryPostes.length > 0 ? (
            <Text fontSize={13.5} color="$brandChalkDim">
              {listing.secondaryPostes.map((poste) => posteLabel(poste, locale)).join(' · ')}
            </Text>
          ) : null}

          <XStack gap="$3" alignItems="center" flexWrap="wrap">
            <Text fontSize={13} color="$brandChalkDim">
              {fill(t.listings.season, { season: listing.season })}
            </Text>
            <Text
              fontSize={13.5}
              fontWeight="700"
              color={listing.applicationCount > 0 ? '$brandPitchBright' : '$brandChalkDim'}
            >
              {fill(t.listings.applications, { count: String(listing.applicationCount) })}
            </Text>
          </XStack>
        </Card>
      ))}

      <PrimaryButton
        label={t.listings.add}
        onPress={() => router.push({ pathname: '/club/listings/new', params: { teamId } })}
      />
    </AppScreen>
  );
}
