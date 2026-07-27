import { categoryLabel, posteLabel } from '@footlink/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { listMyListings, type Listing } from '@/api/listings';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { statusLabel, statusTone } from '@/ui/listing-status';
import { SkeletonList } from '@/ui/skeleton';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Annonces du club.
 *
 * 🔴 **C'est un onglet, et la liste est globale par défaut.** Elle vivait avant
 * uniquement dans le détail d'une équipe, au motif qu'une annonce appartient à
 * une équipe. C'était confondre **à quoi une annonce appartient** et **comment
 * on y accède** : consulter « ce que mon club cherche » est une question de
 * club, pas d'équipe, et l'y enfermer imposait de traverser deux écrans pour
 * une chose qu'on regarde souvent.
 *
 * Le `teamId` reste accepté en paramètre — l'arrivée depuis une équipe filtre
 * alors la liste, et le dit. Sans lui, tout le club.
 *
 * Le filtrage par rôle est fait par le serveur : un entraîneur ne reçoit que
 * ses équipes assignées. L'app ne filtre rien, elle ne saurait pas le faire de
 * façon fiable.
 */
export default function ClubListings(): ReactNode {
  const router = useRouter();
  // `teamId` en paramètre de requête : les annonces vivent dans leur propre
  // pile, pas sous `teams/[id]/` — `[id].tsx` et `[id]/` entreraient en conflit
  // dans expo-router.
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [listings, setListings] = useState<Listing[]>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    setLoading(true);
    try {
      setListings(await authed((token) => listMyListings(token, teamId ? { teamId } : {})));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, teamId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = teamId !== undefined;

  return (
    <AppScreen
      title={t.listings.title}
      subtitle={filtered ? t.listings.subtitle : t.listings.allSubtitle}
      /*
        Retour seulement quand on vient d'une équipe. En onglet, l'écran est une
        racine : un « Retour » y renverrait vers l'écran précédent d'une pile
        que l'utilisateur n'a pas conscience d'avoir empilée.
      */
      {...(filtered
        ? { onBack: () => router.replace({ pathname: '/club/teams/[id]', params: { id: teamId } }) }
        : { allowStackBack: false })}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {/* Une liste filtrée qui ne le dit pas se lit comme une liste vide. */}
      {filtered ? (
        <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
          <Text fontSize={13.5} color="$brandChalkDim">
            {t.listings.filteredByTeam}
          </Text>
          <Pressable
            onPress={() => router.replace('/club/listings')}
            accessibilityRole="button"
          >
            <Text fontSize={13.5} fontWeight="700" color="$brandPitchBright">
              {t.listings.showAll}
            </Text>
          </Pressable>
        </XStack>
      ) : null}

      {/* Silhouettes plutot qu'une roue : l'ecran se dessine deja, et le
          remplacement par les vraies cartes ne fait pas sauter la page. */}
      {listings === undefined && loading ? <SkeletonList count={2} /> : null}

      {listings !== undefined && listings.length === 0 ? (
        <EmptyState text={filtered ? t.listings.empty : t.listings.allEmpty} />
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

          {/*
            L'équipe, toujours — y compris en liste filtrée. Sans elle, deux
            annonces « Gardien » de deux équipes seraient indiscernables, et
            c'est justement le risque qu'ouvre une liste globale.
          */}
          <Text fontSize={13.5} fontWeight="700" color="$brandPitchBright">
            {listing.team.name ?? categoryLabel(listing.team.category, locale)}
          </Text>

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
        onPress={() =>
          router.push(
            teamId
              ? { pathname: '/club/listings/new', params: { teamId } }
              : '/club/listings/new',
          )
        }
      />
    </AppScreen>
  );
}
