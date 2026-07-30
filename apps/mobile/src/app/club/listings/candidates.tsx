import { categoryLabel, posteLabel } from '@footlink/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { listFeedPlayers, type FeedPlayer, type MatchKind } from '@/api/feed';
import { likePlayer, listListingLikes, unlikePlayer } from '@/api/interactions';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { BallIcon } from '@/ui/icons';
import { MatchCelebration } from '@/ui/match-celebration';
import { PrimaryButton } from '@/ui/primary-button';
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
  /** Qui le club a deja retenu. Relu du serveur : c'est lui qui fait foi. */
  const [liked, setLiked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string>();
  const [matched, setMatched] = useState<FeedPlayer>();

  const load = useCallback(async (): Promise<void> => {
    if (!listingId) {
      return;
    }
    setBanner(undefined);
    try {
      /*
        Les deux ensemble : une liste de joueurs sans savoir lesquels sont deja
        retenus ferait clignoter les boutons a chaque ouverture, et le club
        recommencerait son tri depuis zero.
      */
      const [list, likes] = await Promise.all([
        authed((token) => listFeedPlayers(token, listingId, { limit: 30 })),
        authed((token) => listListingLikes(token, listingId)),
      ]);
      setPlayers(list);
      setLiked(likes);
    } catch (error) {
      setBanner(toUserMessage(error, t));
      setPlayers([]);
    }
  }, [authed, listingId, t]);

  /**
   * Retenir un joueur, ou se retracter.
   *
   * ⚠️ **Retenir NE cree pas de conversation a soi seul.** Le joueur est
   * notifie, et il reste libre de ne pas repondre : c'est seulement s'il
   * postule a son tour qu'une relation s'ouvre. Un « like » de club qui
   * ouvrirait d'office une discussion mettrait la pression sur la partie la
   * plus faible du rapport.
   */
  const toggle = useCallback(
    async (playerId: string, already: boolean): Promise<void> => {
      if (!listingId) {
        return;
      }
      setBusy(playerId);
      setBanner(undefined);
      try {
        if (already) {
          await authed((token) => unlikePlayer(token, listingId, playerId));
          setLiked((current) => current.filter((id) => id !== playerId));
        } else {
          const result = await authed((token) => likePlayer(token, listingId, playerId));
          setLiked((current) => [...current, playerId]);
          if (result.matched) {
            setMatched(players?.find((player) => player.id === playerId));
            return;
          }
          setBanner(t.feed.clubLiked);
        }
      } catch (error) {
        setBanner(toUserMessage(error, t));
      } finally {
        setBusy(undefined);
      }
    },
    [authed, listingId, players, t],
  );

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
          {/* La carte mene a la fiche : le club veut voir QUI est ce joueur,
              pas seulement son poste et sa distance. */}
          <Card
            onPress={() =>
              router.push({ pathname: '/club/players/[id]', params: { id: player.id } })
            }
          >
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
                ici. La categorie, elle, n'est jamais masquee : elle s'affiche
                donc meme sans nom de club, sinon masquer son club reviendrait
                a masquer son niveau. */}
            {player.currentClubName || player.currentCategory ? (
              <Text fontSize={13.5} color="$brandChalkDim">
                {[
                  player.currentClubName,
                  player.currentCategory ? categoryLabel(player.currentCategory, locale) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}

            {player.bio ? (
              <Text fontSize={14.5} lineHeight={21} color="$brandChalk" numberOfLines={3}>
                {player.bio}
              </Text>
            ) : null}

            <PrimaryButton
              label={liked.includes(player.id) ? t.feed.clubKept : t.feed.clubKeep}
              variant={liked.includes(player.id) ? 'ghost' : 'solid'}
              loading={busy === player.id}
              onPress={() => void toggle(player.id, liked.includes(player.id))}
            />
          </Card>
        </Appear>
      ))}

      {/*
        Le club voit la MEME celebration que le joueur, avec ses mots a lui :
        c'est la meme rencontre, et deux traitements differents auraient donne
        l'impression que l'evenement compte plus d'un cote que de l'autre.
      */}
      <MatchCelebration
        visible={matched !== undefined}
        clubName={matched ? `${matched.firstName} ${matched.lastName}` : ''}
        subtitle={matched ? posteLabel(matched.matchedPoste, locale) : ''}
        onClose={() => setMatched(undefined)}
      />
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
