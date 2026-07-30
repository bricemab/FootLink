import { categoryLabel, posteLabel } from '@footlink/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { dismissListing, listFeedListings, type FeedListing, type MatchKind } from '@/api/feed';
import { useAuth } from '@/auth/auth-context';
import { ApiError } from '@/api/client';
import { useI18n } from '@/i18n';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { CheckIcon, CrossIcon, StadiumIcon } from '@/ui/icons';
import { PrimaryButton } from '@/ui/primary-button';
import { SkeletonList } from '@/ui/skeleton';
import { SwipeDeck } from '@/ui/swipe-deck';

/**
 * Le feed du joueur — l'écran qui donne enfin une raison d'ouvrir l'app.
 *
 * **Deux modes sur la MÊME source** (choix de Brice) : une liste pour comparer
 * et revenir en arrière, un paquet de cartes pour décider vite. Ils ne
 * rechargent pas de données différentes — c'est la même requête, présentée
 * autrement. Deux appels distincts auraient produit deux ordres différents et
 * l'impression que l'app ment.
 *
 * 🔴 **Chaque carte dit POURQUOI elle est là.** Le serveur renvoie le critère
 * qui a produit la rencontre ; on l'affiche. Un feed qui propose sans expliquer
 * inspire la méfiance, et on ne confie pas une saison à un inconnu proposé sans
 * raison.
 *
 * 🔴 **« Passer » écrit en base ; « Postuler » non — et l'asymétrie est
 * voulue.** Un refus va dans `ListingDismissal` : sans ça, la carte écartée
 * revenait au chargement suivant, et le feed redemandait indéfiniment la même
 * chose. Postuler appartient à la phase 7 : tant que rien n'est écrit, la carte
 * ne doit pas disparaître durablement — un joueur qui voulait justement
 * répondre perdrait l'annonce sans avoir répondu. Le geste droit ne fait donc
 * que retirer la carte de la session en cours.
 *
 * ⚠️ **Un refus porte sur UNE annonce, jamais sur un club.** La table est
 * clavée `(joueur, annonce)` : écarter l'annonce d'un club n'empêche ni de voir
 * ses autres annonces, ni de voir celle qu'il republiera — une annonce recréée
 * porte un nouvel identifiant. C'est la demande explicite de Brice, et c'est
 * aussi la seule lecture defendable : on refuse un poste, pas des gens.
 */
export default function PlayerFeed(): ReactNode {
  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [listings, setListings] = useState<FeedListing[]>();
  const [mode, setMode] = useState<'list' | 'swipe'>('list');
  const [banner, setBanner] = useState<string>();
  const [blocked, setBlocked] = useState<'location' | 'profile'>();
  /**
   * Retirées de l'affichage courant. Un refus est aussi écrit en base — le
   * serveur ne les renverra plus —, mais on ne recharge pas la liste pour
   * autant : l'attente d'un aller-retour réseau à chaque carte casserait le
   * rythme du geste.
   */
  const [passed, setPassed] = useState<string[]>([]);

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    setBlocked(undefined);
    try {
      setListings(await authed((token) => listFeedListings(token, { limit: 30 })));
    } catch (error) {
      /*
       * L'API refuse explicitement quand il manque une donnée indispensable,
       * plutôt que de renvoyer une liste vide. Une liste vide se lirait « aucun
       * club ne veut de moi » — ce qui serait faux et décourageant. On envoie
       * donc la personne compléter ce qui manque.
       */
      if (error instanceof ApiError && error.detail?.includes('location')) {
        setBlocked('location');
      } else if (error instanceof ApiError && error.status === 400) {
        setBlocked('profile');
      } else {
        setBanner(toUserMessage(error, t));
      }
      setListings([]);
    }
  }, [authed, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Écarter une annonce.
   *
   * 🔴 **On retire la carte AVANT la réponse du serveur, et on la remet si
   * l'écriture échoue.** L'ordre inverse — attendre puis retirer — ferait
   * traîner la carte sous le doigt pendant tout l'aller-retour, ce qui se lit
   * comme une application qui rame. Et un échec silencieux serait pire : la
   * carte reviendrait au prochain chargement sans que personne comprenne
   * pourquoi. Elle revient donc tout de suite, avec la raison.
   */
  const dismiss = useCallback(
    async (listingId: string): Promise<void> => {
      setPassed((current) => [...current, listingId]);
      try {
        await authed((token) => dismissListing(token, listingId));
      } catch (error) {
        setPassed((current) => current.filter((id) => id !== listingId));
        setBanner(toUserMessage(error, t));
      }
    },
    [authed, t],
  );

  const visible = (listings ?? []).filter((listing) => !passed.includes(listing.id));

  return (
    <AppScreen
      title={t.feed.title}
      subtitle={t.feed.subtitle}
      allowStackBack={false}
      onRefresh={() => void load()}
      action={
        visible.length > 0 ? (
          <ModeToggle mode={mode} onChange={setMode} labels={t.feed} />
        ) : undefined
      }
    >
      {banner ? <FormBanner message={banner} /> : null}

      {blocked ? (
        <EmptyState
          text={blocked === 'location' ? t.feed.locationRequired : t.feed.profileRequired}
          action={
            <PrimaryButton
              label={t.home.edit}
              onPress={() => router.push('/player/profile')}
            />
          }
        />
      ) : null}

      {listings === undefined ? <SkeletonList count={3} /> : null}

      {listings !== undefined && !blocked && visible.length === 0 ? (
        <EmptyState
          text={t.feed.empty}
          action={
            <PrimaryButton
              label={t.feed.emptyRadius}
              variant="ghost"
              onPress={() => router.push('/player/profile')}
            />
          }
        />
      ) : null}

      {visible.length > 0 && mode === 'list'
        ? visible.map((listing, index) => (
            <Appear key={listing.id} index={index}>
              <ListingCard listing={listing} locale={locale} t={t} fill={fill} />
            </Appear>
          ))
        : null}

      {visible.length > 0 && mode === 'swipe' ? (
        <YStack gap="$3">
          <Text fontSize={13} color="$brandChalkDim" textAlign="center">
            {t.feed.swipeHint}
          </Text>
          <SwipeDeck
            items={visible}
            onDecision={(listing, direction) => {
              if (direction === 'left') {
                void dismiss(listing.id);
                return;
              }
              // Postuler appartient à la phase 7. Rien n'est écrit : la carte
              // ne quitte que la session en cours.
              setPassed((current) => [...current, listing.id]);
              setBanner(t.feed.applySoon);
            }}
            renderCard={(listing) => (
              <ListingCard listing={listing} locale={locale} t={t} fill={fill} tall />
            )}
          />
          <XStack gap="$3" justifyContent="center">
            <RoundAction
              accept={false}
              onPress={() => {
                const first = visible[0];
                if (first) {
                  void dismiss(first.id);
                }
              }}
            />
            <RoundAction
              accept
              onPress={() => {
                const first = visible[0];
                if (first) {
                  setPassed((current) => [...current, first.id]);
                  setBanner(t.feed.applySoon);
                }
              }}
            />
          </XStack>
        </YStack>
      ) : null}
    </AppScreen>
  );
}

/**
 * Une annonce, telle que le joueur la voit.
 *
 * `tall` en mode cartes : une carte qu'on fait glisser doit occuper la main,
 * pas se perdre en haut de l'écran.
 */
function ListingCard({
  listing,
  locale,
  t,
  fill,
  tall = false,
}: {
  listing: FeedListing;
  locale: 'FR' | 'DE' | 'IT';
  t: ReturnType<typeof useI18n>['t'];
  fill: ReturnType<typeof useI18n>['fill'];
  tall?: boolean;
}): ReactNode {
  return (
    <Card variant={tall ? 'hero' : 'card'}>
      <XStack alignItems="center" justifyContent="space-between" gap="$3">
        <Text fontSize={tall ? 24 : 18} fontWeight="800" color="$brandChalk" flexShrink={1}>
          {posteLabel(listing.posteRecherche, locale)}
        </Text>
        <Badge label={reasonLabel(listing.matchKind, t)} tone="accent" />
      </XStack>

      <XStack alignItems="center" gap="$2.5">
        <StadiumIcon size={18} />
        <Text fontSize={15} fontWeight="700" color="$brandChalk" flexShrink={1}>
          {listing.club.name}
        </Text>
      </XStack>

      {/*
        La ligne qui justifie la proposition : l'équipe, la distance, le lieu.
        C'est elle qui transforme « voici une annonce » en « voici pourquoi ».
      */}
      <XStack gap="$2.5" flexWrap="wrap" alignItems="center">
        <Text fontSize={13.5} fontWeight="700" color="$brandPitchBright">
          {listing.team.name ?? categoryLabel(listing.team.category, locale)}
        </Text>
        <Text fontSize={13.5} color="$brandChalkDim">
          {fill(t.feed.distance, { km: String(listing.distanceKm) })}
        </Text>
        {listing.club.locality ? (
          <Text fontSize={13.5} color="$brandChalkDim">
            {listing.club.locality}
          </Text>
        ) : null}
      </XStack>

      {listing.secondaryPostes.length > 0 ? (
        <Text fontSize={13} color="$brandChalkDim">
          {listing.secondaryPostes.map((poste) => posteLabel(poste, locale)).join(' · ')}
        </Text>
      ) : null}

      {listing.description ? (
        <Text fontSize={14.5} lineHeight={21} color="$brandChalk" numberOfLines={tall ? 6 : 3}>
          {listing.description}
        </Text>
      ) : null}
    </Card>
  );
}

/** Le critère, en mots. L'ordre suit la pertinence décidée par le serveur. */
function reasonLabel(kind: MatchKind, t: ReturnType<typeof useI18n>['t']): string {
  switch (kind) {
    case 'POSTE_PRINCIPAL':
      return t.feed.reasonPrincipal;
    case 'POSTE_SECONDAIRE':
      return t.feed.reasonSecondaire;
    case 'POSTE_ACCEPTE':
      return t.feed.reasonAccepte;
    default:
      return t.feed.reasonAccepteSecondaire;
  }
}

/**
 * Bascule liste / cartes.
 *
 * Dans l'en-tête et non en bas : c'est un réglage de présentation, pas une
 * action. Le placer près du pouce le mettrait en concurrence avec les gestes du
 * paquet de cartes.
 */
function ModeToggle({
  mode,
  onChange,
  labels,
}: {
  mode: 'list' | 'swipe';
  onChange: (next: 'list' | 'swipe') => void;
  labels: { modeList: string; modeSwipe: string };
}): ReactNode {
  return (
    <XStack borderRadius={999} overflow="hidden" borderWidth={1.5} borderColor="rgba(244,251,247,0.16)">
      {(['list', 'swipe'] as const).map((value) => {
        const active = mode === value;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <YStack
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              backgroundColor={active ? 'rgba(57,255,136,0.18)' : 'transparent'}
            >
              <Text
                fontSize={12.5}
                fontWeight="700"
                color={active ? '$brandPitchBright' : '$brandChalkDim'}
              >
                {value === 'list' ? labels.modeList : labels.modeSwipe}
              </Text>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/**
 * Les deux boutons sous le paquet.
 *
 * ⚠️ **Ils doublent le geste, ils ne le remplacent pas.** Un produit qui
 * n'existe qu'au glissement exclut ceux qui ne peuvent pas le faire — et prive
 * tout le monde d'un moyen précis quand la main est occupée. La règle vaut
 * partout : jamais d'action accessible UNIQUEMENT par un geste.
 */
function RoundAction({ accept, onPress }: { accept: boolean; onPress: () => void }): ReactNode {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <YStack
          width={62}
          height={62}
          borderRadius={31}
          alignItems="center"
          justifyContent="center"
          backgroundColor="rgba(7,19,15,0.85)"
          borderWidth={2}
          borderColor={accept ? 'rgba(57,255,136,0.7)' : 'rgba(255,90,95,0.7)'}
          opacity={pressed ? 0.75 : 1}
          scale={pressed ? 0.94 : 1}
        >
          {accept ? <CheckIcon size={26} /> : <CrossIcon size={26} />}
        </YStack>
      )}
    </Pressable>
  );
}
