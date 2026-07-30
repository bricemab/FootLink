import { categoryLabel, posteLabel, type Poste } from '@footlink/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { dismissListing, listFeedListings, type FeedListing, type MatchKind } from '@/api/feed';
import {
  applyToListing,
  removeInterest,
  saveListing,
  undismissListing,
} from '@/api/interactions';
import { useAuth } from '@/auth/auth-context';
import { ApiError } from '@/api/client';
import { useI18n } from '@/i18n';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { BookmarkIcon, CheckIcon, CrossIcon, StadiumIcon, UndoIcon } from '@/ui/icons';
import { PrimaryButton } from '@/ui/primary-button';
import { PitchPositions, PITCH_RATIO } from '@/ui/pitch-positions';
import { MatchCelebration } from '@/ui/match-celebration';
import { SkeletonList } from '@/ui/skeleton';
import { TYPE } from '@/ui/type-scale';
import { SwipeDeck, type SwipeDirection } from '@/ui/swipe-deck';

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
 * 🔴 **Trois issues, et une seule engage.** C'est ce qui manquait :
 *
 * - droite — **postuler**. Le club est notifié. C'est public.
 * - haut — **enregistrer**. Signet privé, personne n'est prévenu.
 * - gauche — **passer**. Rien n'est dit à personne, et c'est annulable.
 *
 * Avec deux gestes seulement, chaque carte forçait soit un engagement
 * prématuré — postuler prévient un vrai club immédiatement —, soit une perte
 * définitive. Un paquet de cartes ne fonctionne que si le geste est bon marché,
 * et le seul geste gratuit était le destructeur.
 *
 * ⚠️ **Aucune action n'est accessible UNIQUEMENT par un geste.** Les trois
 * boutons sous la carte ne doublent pas le glissement par confort : ils sont ce
 * qui rend l'écran utilisable d'une main occupée, ou par quelqu'un qui ne peut
 * pas glisser.
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
  /*
   * 🔴 **Le paquet de cartes par DEFAUT.** La liste l'etait, et c'etait le
   * choix timide : on ouvrait sur un inventaire a lire, la ou le produit
   * promet une decision a prendre. Une carte plein ecran pose une question a
   * la fois et attend un geste — c'est ce qui donne envie de rouvrir l'app
   * demain. La liste reste a un appui, pour comparer et revenir en arriere.
   */
  const [mode, setMode] = useState<'list' | 'swipe'>('swipe');
  const [banner, setBanner] = useState<string>();
  const [blocked, setBlocked] = useState<'location' | 'profile'>();
  /**
   * Retirées de l'affichage courant. Un refus est aussi écrit en base — le
   * serveur ne les renverra plus —, mais on ne recharge pas la liste pour
   * autant : l'attente d'un aller-retour réseau à chaque carte casserait le
   * rythme du geste.
   */
  const [passed, setPassed] = useState<string[]>([]);
  /**
   * Le dernier geste, pour pouvoir revenir dessus.
   *
   * 🔴 **C'est ce qui rend le paquet leger.** Sans retour en arriere, chaque
   * carte est un aller simple : on hesite avant chacune, et un paquet ou l'on
   * hesite ne sert a rien. Un seul niveau — au-dela, on ne se souvient plus de
   * ce qu'on annule.
   */
  const [last, setLast] = useState<{ listingId: string; direction: SwipeDirection }>();
  /** Le recto pose la question, le verso donne le detail. Remis a plat a chaque carte. */
  const [flipped, setFlipped] = useState(false);
  /** Le club retenait deja ce joueur : la rencontre se celebre en plein ecran. */
  const [matched, setMatched] = useState<FeedListing>();

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
  const act = useCallback(
    async (listingId: string, direction: SwipeDirection): Promise<void> => {
      setFlipped(false);
      setPassed((current) => [...current, listingId]);
      setLast({ listingId, direction });
      try {
        if (direction === 'left') {
          await authed((token) => dismissListing(token, listingId));
          return;
        }
        if (direction === 'up') {
          await authed((token) => saveListing(token, listingId));
          setBanner(t.feed.savedDone);
          return;
        }
        const result = await authed((token) => applyToListing(token, listingId));
        if (result.matched) {
          // Le plein ecran REMPLACE la banniere : deux annonces du meme
          // evenement, l'une derriere l'autre, diluent le moment.
          setMatched(listings?.find((item) => item.id === listingId));
          return;
        }
        setBanner(t.feed.appliedDone);
      } catch (error) {
        setPassed((current) => current.filter((id) => id !== listingId));
        setLast(undefined);
        setBanner(toUserMessage(error, t));
      }
    },
    [authed, listings, t],
  );

  /**
   * Revenir sur le dernier geste.
   *
   * ⚠️ **Annuler une candidature n'annule pas la notification** deja recue par
   * le club : elle pointera vers une candidature qui n'existe plus. C'est un
   * defaut assume — bien moindre que d'enfermer quelqu'un dans une candidature
   * qu'il n'a pas voulue. Le serveur refuse en revanche des qu'un match est ne :
   * la conversation, elle, ne peut pas disparaitre sans un mot.
   */
  const undo = useCallback(async (): Promise<void> => {
    if (!last) {
      return;
    }
    const { listingId, direction } = last;
    setLast(undefined);
    setPassed((current) => current.filter((id) => id !== listingId));
    setBanner(undefined);
    try {
      await authed((token) =>
        direction === 'left'
          ? undismissListing(token, listingId)
          : removeInterest(token, listingId),
      );
      await load();
    } catch (error) {
      // Le geste tient toujours cote serveur : on remet la carte de cote pour
      // ne pas afficher une annonce que le feed ne renverra plus.
      setPassed((current) => [...current, listingId]);
      setBanner(toUserMessage(error, t));
    }
  }, [authed, last, load, t]);

  const visible = (listings ?? []).filter((listing) => !passed.includes(listing.id));
  const deck = mode === 'swipe' && visible.length > 0;

  return (
    <AppScreen
      title={t.feed.title}
      /*
        Pas de sous-titre en mode cartes : chaque ligne prise en haut est prise
        a la carte, et c'est elle qui doit tomber sous le pouce.
      */
      subtitle={deck ? undefined : t.feed.subtitle}
      allowStackBack={false}
      fill={deck}
      onRefresh={deck ? undefined : () => void load()}
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
              <ListingCard
                listing={listing}
                locale={locale}
                t={t}
                fill={fill}
                onSave={() => void act(listing.id, 'up')}
                onApply={() => void act(listing.id, 'right')}
              />
            </Appear>
          ))
        : null}

      {deck ? (
        <>
          <SwipeDeck
            items={visible}
            stamps={{ yes: t.feed.apply, no: t.feed.pass, up: t.feed.save }}
            onDecision={(listing, direction) => void act(listing.id, direction)}
            onTap={() => setFlipped((current) => !current)}
            renderCard={(listing, index) => (
              <SwipeCard
                listing={listing}
                locale={locale}
                t={t}
                fill={fill}
                flipped={index === 0 && flipped}
              />
            )}
          />
          {/*
            Quatre boutons, quatre poids. Le diametre dit l'importance : les
            deux decisions franches sont les plus grosses, garder vient ensuite,
            et annuler reste discret — c'est un rattrapage, pas une quatrieme
            option qu'on choisirait.
          */}
          <XStack gap="$3.5" justifyContent="center" alignItems="center">
            <RoundAction
              kind="undo"
              disabled={last === undefined}
              onPress={() => void undo()}
            />
            <RoundAction
              kind="pass"
              onPress={() => {
                const first = visible[0];
                if (first) {
                  void act(first.id, 'left');
                }
              }}
            />
            <RoundAction
              kind="save"
              onPress={() => {
                const first = visible[0];
                if (first) {
                  void act(first.id, 'up');
                }
              }}
            />
            <RoundAction
              kind="apply"
              onPress={() => {
                const first = visible[0];
                if (first) {
                  void act(first.id, 'right');
                }
              }}
            />
          </XStack>
        </>
      ) : null}

      <MatchCelebration
        visible={matched !== undefined}
        clubName={matched?.club.name ?? ''}
        subtitle={matched ? posteLabel(matched.posteRecherche, locale) : ''}
        onClose={() => setMatched(undefined)}
        seeMoreLabel={t.match.seeApplications}
        onSeeMore={() => {
          setMatched(undefined);
          router.push('/player/applications');
        }}
      />
    </AppScreen>
  );
}

/**
 * La carte du paquet — la seule chose à l'écran, et elle doit tenir seule.
 *
 * 🔴 **Le terrain est la photo de la carte.** Un paquet de cartes vit de son
 * image : sans elle, il ne reste qu'un paragraphe qu'on fait glisser, et le
 * geste n'a plus de raison d'être. Nous n'avons pas de photo de club — mais
 * nous avons mieux, parce que c'est la question posée : le terrain, avec le
 * poste cherché qui s'allume. On sait où on jouerait avant d'avoir lu un mot.
 *
 * ⚠️ **Aucun dégradé natif.** La profondeur vient d'un disque vert flouté par
 * son opacité, posé derrière le contenu — pas d'`expo-linear-gradient`. Ajouter
 * un module natif pour un fond coûterait un `prebuild` et un build EAS, et deux
 * builds ont déjà été perdus sur un module natif absent (cf. HANDOFF).
 */
function SwipeCard({
  listing,
  locale,
  t,
  fill,
  flipped = false,
}: {
  listing: FeedListing;
  locale: 'FR' | 'DE' | 'IT';
  t: ReturnType<typeof useI18n>['t'];
  fill: ReturnType<typeof useI18n>['fill'];
  /** Vrai = on regarde le verso. Piloté par l'écran, pas par la carte. */
  flipped?: boolean;
}): ReactNode {
  /*
    🔴 **La rotation est pilotee par une valeur DERIVEE de la prop**, et non par
    un effet qui declencherait une animation. Une valeur derivee vit sur le fil
    d'UI : le retournement continue meme si le fil JavaScript est occupe a
    charger la page suivante — exactement la meme raison que pour le glissement.

    ⚠️ Un demi-tour et pas plus : au-dela de 180° on repasse par la tranche une
    seconde fois, et l'animation se lit comme un bug.
  */
  const progress = useDerivedValue(() =>
    withTiming(flipped ? 1 : 0, { duration: 420 }),
  );

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${progress.value * 180}deg` }],
    // `backfaceVisibility` seul ne suffit pas sur tous les Android : l'opacite
    // garantit qu'une face ne transparait jamais a travers l'autre.
    opacity: progress.value < 0.5 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${180 + progress.value * 180}deg` }],
    opacity: progress.value < 0.5 ? 0 : 1,
  }));

  return (
    <YStack flex={1}>
      <Animated.View style={[{ flex: 1 }, frontStyle]}>
        <CardFace>{renderFront()}</CardFace>
      </Animated.View>
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
          backStyle,
        ]}
      >
        <CardFace>{renderBack()}</CardFace>
      </Animated.View>
    </YStack>
  );

  function renderFront(): ReactNode {
    return (
      <YStack flex={1} padding="$4" gap="$3">
        <XStack alignItems="center" gap="$2.5">
          <YStack
            width={44}
            height={44}
            borderRadius={14}
            alignItems="center"
            justifyContent="center"
            backgroundColor="rgba(7,19,15,0.75)"
            borderWidth={1}
            borderColor="rgba(244,251,247,0.16)"
          >
            <StadiumIcon size={22} />
          </YStack>
          <YStack flexShrink={1} gap="$0.5">
            <Text fontSize={17} fontWeight="800" color="$brandChalk" flexShrink={1}>
              {listing.club.name}
            </Text>
            <Text fontSize={13} color="$brandChalkDim" flexShrink={1}>
              {[
                listing.club.locality,
                fill(t.feed.distance, { km: String(listing.distanceKm) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </YStack>
        </XStack>

        <PitchSlot
          primary={listing.posteRecherche}
          secondary={listing.secondaryPostes}
          labels={{ primary: t.listings.mainPoste, secondary: t.listings.otherPostes }}
        />

        <YStack gap="$2">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Badge label={reasonLabel(listing.matchKind, t)} tone="accent" />
            <Badge label={categoryLabel(listing.team.category, locale)} />
          </XStack>

          {/* Le poste, en grand : c'est LA question de la carte. */}
          <Text
            fontSize={30}
            lineHeight={34}
            fontWeight="800"
            letterSpacing={-0.6}
            color="$brandChalk"
          >
            {posteLabel(listing.posteRecherche, locale)}
          </Text>

          {listing.description ? (
            <Text fontSize={14.5} lineHeight={20} color="$brandChalkDim" numberOfLines={2}>
              {listing.description}
            </Text>
          ) : null}

          {/* L'invitation a retourner. Sans elle, personne ne devine qu'il y a
              un verso — un geste invisible n'existe pas. */}
          <XStack alignItems="center" gap="$1.5">
            <UndoIcon size={13} color="rgba(169,196,184,0.7)" />
            <Text fontSize={12.5} color="$brandChalkDim">
              {t.feed.tapForMore}
            </Text>
          </XStack>
        </YStack>
      </YStack>
    );
  }

  /**
   * Le verso : ce que le recto ne pouvait pas porter.
   *
   * ⚠️ **Il ne repete pas le recto.** Un verso qui redit la meme chose en plus
   * petit donne l'impression d'avoir perdu son geste. Ici : la description
   * ENTIERE (le recto la coupe a deux lignes), les postes acceptes en toutes
   * lettres, l'equipe et la saison — de quoi decider, pas de quoi relire.
   */
  function renderBack(): ReactNode {
    return (
      <YStack flex={1} padding="$4" gap="$3.5">
        <YStack gap="$1">
          <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
            {t.feed.detailTitle.toUpperCase()}
          </Text>
          <Text fontSize={22} fontWeight="800" letterSpacing={-0.4} color="$brandChalk">
            {listing.club.name}
          </Text>
        </YStack>

        <YStack gap="$2">
          <DetailRow
            label={t.listings.team}
            value={listing.team.name ?? categoryLabel(listing.team.category, locale)}
          />
          {/* Pas de ligne « genre » : le feed ne propose que des equipes du
              genre du joueur, l'afficher n'apprendrait rien. */}
          <DetailRow label={t.feed.seasonLabel} value={listing.season} />
          <DetailRow
            label={t.listings.mainPoste}
            value={posteLabel(listing.posteRecherche, locale)}
          />
          {listing.secondaryPostes.length > 0 ? (
            <DetailRow
              label={t.listings.otherPostes}
              value={listing.secondaryPostes
                .map((poste) => posteLabel(poste, locale))
                .join(' · ')}
            />
          ) : null}
          {listing.club.locality ? (
            <DetailRow
              label={t.club.locality}
              value={`${listing.club.locality} · ${fill(t.feed.distance, {
                km: String(listing.distanceKm),
              })}`}
            />
          ) : null}
        </YStack>

        {listing.description ? (
          <YStack flex={1}>
            <Text fontSize={15} lineHeight={22} color="$brandChalk">
              {listing.description}
            </Text>
          </YStack>
        ) : (
          <YStack flex={1} />
        )}

        <XStack alignItems="center" gap="$1.5">
          <UndoIcon size={13} color="rgba(169,196,184,0.7)" />
          <Text fontSize={12.5} color="$brandChalkDim">
            {t.feed.tapToReturn}
          </Text>
        </XStack>
      </YStack>
    );
  }
}

/**
 * Le cadre commun aux deux faces.
 *
 * Extrait pour que recto et verso ne puissent pas diverger : deux cadres ecrits
 * separement finissent toujours par ne plus avoir le meme rayon, et le
 * retournement laisse alors voir un saut.
 */
function CardFace({ children }: { children: ReactNode }): ReactNode {
  return (
    <YStack
      flex={1}
      borderRadius={28}
      overflow="hidden"
      backgroundColor="rgba(9,24,18,0.97)"
      borderWidth={1.5}
      borderColor="rgba(57,255,136,0.32)"
      shadowColor="#39FF88"
      shadowOpacity={0.18}
      shadowRadius={26}
      shadowOffset={{ width: 0, height: 10 }}
      elevation={8}
    >
      {/* Le halo de la carte. Décoratif : il ne doit jamais intercepter le
          geste, qui appartient à la carte entière. */}
      <YStack
        position="absolute"
        top={-110}
        right={-90}
        width={280}
        height={280}
        borderRadius={140}
        backgroundColor="#1DBF73"
        opacity={0.3}
        pointerEvents="none"
      />
      {children}
    </YStack>
  );
}

/** Une ligne du verso : intitulé à gauche, valeur à droite. */
function DetailRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
      <Text fontSize={12.5} fontWeight="700" letterSpacing={0.4} color="$brandChalkDim">
        {label.toUpperCase()}
      </Text>
      <Text
        fontSize={14.5}
        fontWeight="600"
        color="$brandChalk"
        flexShrink={1}
        textAlign="right"
      >
        {value}
      </Text>
    </XStack>
  );
}

/**
 * Le terrain, dimensionné sur la place qui RESTE.
 *
 * ⚠️ `PitchPositions` se dimensionne sur sa largeur (hauteur = largeur x
 * `PITCH_RATIO`). Lui donner toute la largeur de la carte marchait sur un grand
 * telephone et debordait sur un petit, ou par le bas il aurait mange le poste
 * et la description. On mesure donc la place disponible et on prend la plus
 * contraignante des deux dimensions.
 */
function PitchSlot({
  primary,
  secondary,
  labels,
}: {
  primary: Poste;
  secondary: Poste[];
  labels: { primary: string; secondary: string };
}): ReactNode {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const size = Math.min(box.width, box.height / PITCH_RATIO);

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      onLayout={(event) =>
        setBox({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {/* En dessous d'une certaine taille, les pastilles se chevauchent : mieux
          vaut ne rien dessiner qu'un terrain illisible. */}
      {size > 140 ? (
        <YStack width={size}>
          <PitchPositions
            value={{ primary, secondary }}
            onChange={() => undefined}
            labels={labels}
            readOnly
            showSummary={false}
          />
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Une annonce en LISTE — pour comparer, revenir en arriere, relire.
 *
 * Le mode cartes a sa propre carte (`SwipeCard`) : les deux repondaient au
 * meme composant avec un drapeau `tall`, et ce drapeau ne changeait qu'une
 * taille de police. Une carte qu'on fait glisser et une ligne qu'on parcourt
 * n'ont ni la meme hierarchie ni le meme contenu — les confondre bridait les
 * deux.
 */
function ListingCard({
  listing,
  locale,
  t,
  fill,
  onSave,
  onApply,
}: {
  listing: FeedListing;
  locale: 'FR' | 'DE' | 'IT';
  t: ReturnType<typeof useI18n>['t'];
  fill: ReturnType<typeof useI18n>['fill'];
  onSave: () => void;
  onApply: () => void;
}): ReactNode {
  return (
    <Card variant="card">
      <XStack alignItems="center" justifyContent="space-between" gap="$3">
        <Text {...TYPE.heading} color="$brandChalk" flexShrink={1}>
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
        <Text fontSize={14.5} lineHeight={21} color="$brandChalk" numberOfLines={3}>
          {listing.description}
        </Text>
      ) : null}

      {/*
        🔴 **La liste AGIT, elle ne fait pas que montrer.** Sans ces deux
        boutons, le selecteur Liste/Cartes changeait ce qu'on POUVAIT FAIRE et
        pas seulement l'apparence : on pouvait comparer, mais rien decider sans
        repasser aux cartes.

        ⚠️ Pas de « passer » ici, et c'est delibere : ecarter est un geste de
        tri rapide, il appartient au paquet. Une liste sert a choisir, pas a
        eliminer — et un bouton de rejet au milieu d'une liste s'appuie par
        accident bien plus souvent qu'un glissement.
      */}
      <XStack gap="$2.5" alignItems="center">
        <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel={t.feed.save}>
          {({ pressed }) => (
            <YStack
              width={44}
              height={44}
              borderRadius={14}
              alignItems="center"
              justifyContent="center"
              borderWidth={1.5}
              borderColor="rgba(255,193,77,0.55)"
              backgroundColor="rgba(7,19,15,0.6)"
              opacity={pressed ? 0.75 : 1}
              scale={pressed ? 0.94 : 1}
            >
              <BookmarkIcon size={20} />
            </YStack>
          )}
        </Pressable>
        <YStack flex={1}>
          <PrimaryButton label={t.feed.apply} variant="ghost" onPress={onApply} />
        </YStack>
      </XStack>
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
function RoundAction({
  kind,
  onPress,
  disabled = false,
}: {
  kind: 'undo' | 'pass' | 'save' | 'apply';
  onPress: () => void;
  disabled?: boolean;
}): ReactNode {
  /*
    Le diametre EST la hierarchie. Les deux decisions franches sont les plus
    grosses ; garder vient ensuite parce qu'il n'engage rien ; annuler est le
    plus petit — c'est un rattrapage, pas une quatrieme option qu'on choisirait.
  */
  const size = kind === 'undo' ? 46 : kind === 'save' ? 54 : 62;
  const border =
    kind === 'apply'
      ? 'rgba(57,255,136,0.7)'
      : kind === 'pass'
        ? 'rgba(255,90,95,0.7)'
        : kind === 'save'
          ? 'rgba(255,193,77,0.7)'
          : 'rgba(244,251,247,0.22)';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      {({ pressed }) => (
        <YStack
          width={size}
          height={size}
          borderRadius={size / 2}
          alignItems="center"
          justifyContent="center"
          backgroundColor="rgba(7,19,15,0.85)"
          borderWidth={2}
          borderColor={border}
          // Desactive : visiblement eteint, mais toujours a sa place. Le faire
          // disparaitre decalerait les trois autres a chaque carte.
          opacity={disabled ? 0.35 : pressed ? 0.75 : 1}
          scale={pressed && !disabled ? 0.94 : 1}
        >
          {kind === 'apply' ? (
            <CheckIcon size={26} />
          ) : kind === 'pass' ? (
            <CrossIcon size={26} />
          ) : kind === 'save' ? (
            <BookmarkIcon size={22} />
          ) : (
            <UndoIcon size={19} />
          )}
        </YStack>
      )}
    </Pressable>
  );
}
