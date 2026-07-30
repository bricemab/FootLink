import { categoryLabel, posteLabel } from '@footlink/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { listFeedPlayers, type FeedPlayer, type MatchKind } from '@/api/feed';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { BallIcon } from '@/ui/icons';
import { SkeletonList } from '@/ui/skeleton';

/**
 * Les joueurs qui correspondent à une annonce.
 *
 * Le miroir exact du feed joueur : même moteur, mêmes critères, sens inverse.
 *
 * ⚠️ **Le rayon du JOUEUR filtre ici aussi**, et c'est délibéré. Un joueur qui a
 * dit « 15 km » n'apparaît pas à un club situé à 80 km, même si le club, lui,
 * accepterait de le prendre. Le club perdrait son temps et le joueur recevrait
 * des propositions qu'il a explicitement exclues. Une liste plus courte mais
 * vraie vaut mieux qu'une liste flatteuse.
 *
 * ⚠️ **`?listingId=` en paramètre de requête** et non `[id]/players` : les
 * annonces vivent dans une pile où `[id].tsx` existe déjà, et `[id].tsx` +
 * `[id]/` entrent en conflit dans expo-router.
 */
export default function ListingCandidates(): ReactNode {
  const router = useRouter();
  const { listingId } = useLocalSearchParams<{ listingId?: string }>();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [players, setPlayers] = useState<FeedPlayer[]>();
  const [banner, setBanner] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    if (!listingId) {
      return;
    }
    setBanner(undefined);
    try {
      setPlayers(await authed((token) => listFeedPlayers(token, listingId, { limit: 30 })));
    } catch (error) {
      setBanner(toUserMessage(error, t));
      setPlayers([]);
    }
  }, [authed, listingId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const seasonStartYear = new Date().getUTCMonth() >= 7
    ? new Date().getUTCFullYear()
    : new Date().getUTCFullYear() - 1;

  return (
    <AppScreen
      title={t.feed.playersTitle}
      subtitle={t.feed.playersSubtitle}
      onBack={() =>
        router.replace({ pathname: '/club/listings/[id]', params: { id: listingId ?? '' } })
      }
      onRefresh={() => void load()}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {players === undefined ? <SkeletonList count={3} /> : null}

      {players !== undefined && players.length === 0 && !banner ? (
        <EmptyState text={t.feed.playersEmpty} />
      ) : null}

      {players?.map((player, index) => (
        <Appear key={player.id} index={index}>
          <Card>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <XStack alignItems="center" gap="$2.5" flexShrink={1}>
                <BallIcon size={20} />
                <Text fontSize={17} fontWeight="700" color="$brandChalk" flexShrink={1}>
                  {player.firstName} {player.lastName}
                </Text>
              </XStack>
              <Badge label={reasonLabel(player.matchKind, t)} tone="accent" />
            </XStack>

            {/* Ce qui justifie la proposition, sur une ligne. */}
            <XStack gap="$2.5" flexWrap="wrap" alignItems="center">
              <Text fontSize={13.5} fontWeight="700" color="$brandPitchBright">
                {posteLabel(player.matchedPoste, locale)}
              </Text>
              <Text fontSize={13.5} color="$brandChalkDim">
                {fill(t.feed.distance, { km: String(player.distanceKm) })}
              </Text>
              <Text fontSize={13.5} color="$brandChalkDim">
                {fill(t.feed.age, { age: String(seasonStartYear - player.birthYear) })}
              </Text>
              {player.locality ? (
                <Text fontSize={13.5} color="$brandChalkDim">
                  {player.locality}
                </Text>
              ) : null}
            </XStack>

            {/* Repeter « Defenseur central » sous « Defenseur central » n'apprend
                rien : la liste complete ne sert que si le joueur en tient plusieurs. */}
            {player.postes.length > 1 ? (
              <Text fontSize={13.5} color="$brandChalkDim">
                {player.postes.map((position) => posteLabel(position.poste, locale)).join(' · ')}
              </Text>
            ) : null}

            {/* Le club actuel n'apparaît QUE si le joueur ne l'a pas masqué —
                le serveur renvoie `null` dans ce cas, il n'y a rien à filtrer
                ici. */}
            {player.currentClubName ? (
              <Text fontSize={13.5} color="$brandChalkDim">
                {player.currentClubName}
                {player.currentCategory ? ` · ${categoryLabel(player.currentCategory, locale)}` : ''}
              </Text>
            ) : null}

            {player.bio ? (
              <Text fontSize={14.5} lineHeight={21} color="$brandChalk" numberOfLines={3}>
                {player.bio}
              </Text>
            ) : null}
          </Card>
        </Appear>
      ))}
    </AppScreen>
  );
}

/**
 * Le critere, dit DEPUIS LE CLUB.
 *
 * ⚠️ Les libelles du feed joueur ne conviennent pas ici : « cherche ton poste »
 * s'adresse au joueur, et l'afficher sur la fiche d'un joueur inverse le sens.
 * Meme critere, autre bord, autres mots.
 */
function reasonLabel(kind: MatchKind, t: ReturnType<typeof useI18n>['t']): string {
  switch (kind) {
    case 'POSTE_PRINCIPAL':
      return t.feed.reasonClubPrincipal;
    case 'POSTE_SECONDAIRE':
      return t.feed.reasonClubSecondaire;
    case 'POSTE_ACCEPTE':
      return t.feed.reasonClubAccepte;
    default:
      return t.feed.reasonClubAccepteSecondaire;
  }
}
