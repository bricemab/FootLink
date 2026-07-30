import { categoryLabel, posteLabel, strongFootLabel } from '@footlink/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { getFeedPlayer, type FeedPlayer } from '@/api/feed';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppImage } from '@/ui/app-image';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, SectionTitle } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { BallIcon } from '@/ui/icons';
import { PitchPositions } from '@/ui/pitch-positions';
import { SkeletonCard } from '@/ui/skeleton';
import { TYPE } from '@/ui/type-scale';

/**
 * La fiche d'un joueur, vue par un club.
 *
 * 🔴 **Le terrain porte la fiche.** Une liste de noms de postes en texte oblige
 * à reconstruire mentalement une position ; le dessin la donne d'un coup d'œil.
 * C'est le même composant que le profil du joueur et que l'onboarding — un
 * entraîneur qui regarde un joueur voit exactement ce que le joueur a dessiné.
 *
 * ⚠️ **On n'affiche que ce que le joueur a accepté de montrer.** Le club actuel
 * arrive déjà à `null` quand il l'a masqué : le filtrage est fait par le serveur,
 * pas ici. Un masquage appliqué côté app se contournerait en lisant la réponse.
 */
export default function PlayerProfileForClub(): ReactNode {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [player, setPlayer] = useState<FeedPlayer>();
  const [banner, setBanner] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    /*
      ⚠️ Sans identifiant, on DIT qu'il n'y a rien — on ne reste pas à charger.
      Un `return` muet laissait le squelette tourner indéfiniment, et c'est
      exactement ce qu'on a vu : l'écran atteint sans paramètre affichait une
      carte grise pour toujours, sans le moindre indice de ce qui clochait.
      Un chargement sans fin est le pire des échecs : il ne se diagnostique pas.
    */
    if (!id) {
      setBanner(t.errors.unknown);
      return;
    }
    setBanner(undefined);
    try {
      setPlayer(await authed((token) => getFeedPlayer(token, id)));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    }
  }, [authed, id, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const seasonStartYear =
    new Date().getUTCMonth() >= 7 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;

  const primary = player?.postes.find((position) => position.isPrimary)?.poste ?? null;
  const secondary = player?.postes.filter((position) => !position.isPrimary) ?? [];

  return (
    <AppScreen
      title={player ? `${player.firstName} ${player.lastName}` : t.feed.playerTitle}
      subtitle={
        player
          ? [
              primary ? posteLabel(primary, locale) : null,
              fill(t.feed.age, { age: String(seasonStartYear - player.birthYear) }),
              player.locality,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      onBack={() => router.back()}
      onRefresh={() => void load()}
    >
      {banner ? <FormBanner message={banner} /> : null}
      {player === undefined && !banner ? <SkeletonCard /> : null}

      {player ? (
        <>
          <Appear index={0}>
            <Card variant="hero">
              <XStack gap="$3.5" alignItems="center">
                <YStack
                  width={72}
                  height={72}
                  borderRadius={36}
                  overflow="hidden"
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor="rgba(7,19,15,0.75)"
                  borderWidth={1.5}
                  borderColor={
                    player.avatarUrl ? 'rgba(57,255,136,0.35)' : 'rgba(244,251,247,0.14)'
                  }
                >
                  {player.avatarUrl ? (
                    <AppImage uri={player.avatarUrl} size={72} />
                  ) : (
                    <BallIcon size={28} />
                  )}
                </YStack>
                {/*
                  ⚠️ La categorie et le nom du club sont DEUX informations,
                  pas une. Elles etaient liees — la categorie ne s'affichait
                  qu'a l'interieur du nom du club — si bien qu'un joueur qui
                  masque son club masquait aussi son niveau. Or le niveau est
                  precisement ce qu'un club regarde, et le joueur ne l'a jamais
                  masque : seul `hideCurrentClub` existe.
                */}
                <YStack flexShrink={1} gap="$2">
                  <XStack gap="$2" flexWrap="wrap">
                    <Badge
                      label={fill(t.feed.distance, { km: String(player.distanceKm) })}
                      tone="accent"
                    />
                    {player.currentCategory ? (
                      <Badge label={categoryLabel(player.currentCategory, locale)} />
                    ) : null}
                  </XStack>
                  {player.currentClubName ? (
                    <Text {...TYPE.body} color="$brandChalk" flexShrink={1}>
                      {player.currentClubName}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
            </Card>
          </Appear>

          {/* 🔴 Le terrain, en grand : c'est lui qui dit où joue ce joueur. */}
          <Appear index={1}>
            <YStack gap="$2">
              <SectionTitle>{t.feed.theirPitch}</SectionTitle>
              <PitchPositions
                value={{ primary, secondary: secondary.map((position) => position.poste) }}
                onChange={() => undefined}
                readOnly
              />
            </YStack>
          </Appear>

          <Appear index={2}>
            <Card variant="plain">
              {player.strongFoot ? (
                <Row label={t.home.foot} value={strongFootLabel(player.strongFoot, locale)} />
              ) : null}
              {player.heightCm ? (
                <Row
                  label={t.home.height}
                  value={fill(t.home.heightValue, { cm: String(player.heightCm) })}
                />
              ) : null}
              <Row label={t.onboarding.birthYear} value={String(player.birthYear)} />
              {/* `canton` est un canton (VS, VD), pas une localite : l'etiqueter
                  « Localite » faisait lire « Localite : VS » juste sous un
                  sous-titre qui disait deja « Sion ». */}
              {player.canton ? <Row label={t.feed.canton} value={player.canton} /> : null}
            </Card>
          </Appear>

          {player.bio ? (
            <Appear index={3}>
              <Card variant="plain">
                <Text {...TYPE.body} color="$brandChalk">
                  {player.bio}
                </Text>
              </Card>
            </Appear>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <XStack justifyContent="space-between" alignItems="center" gap="$3">
      <Text {...TYPE.meta} color="$brandChalkDim">
        {label.toUpperCase()}
      </Text>
      <Text {...TYPE.body} color="$brandChalk" flexShrink={1} textAlign="right">
        {value}
      </Text>
    </XStack>
  );
}
