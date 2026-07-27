import { categoryLabel, posteLabel, strongFootLabel } from '@footlink/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { confirmAvatar, createAvatarUpload, removeAvatar } from '@/api/avatar';
import { putToStorage } from '@/api/club-logo';
import { getMyClub, type MyClubResponse } from '@/api/clubs';
import { getMyPlayerProfile, type PlayerProfileResponse } from '@/api/players';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppImage } from '@/ui/app-image';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, EmptyState, SectionTitle } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { BallIcon } from '@/ui/icons';
import { PitchPositions } from '@/ui/pitch-positions';
import { PrimaryButton } from '@/ui/primary-button';
import { SkeletonCard } from '@/ui/skeleton';

/**
 * Fiche du joueur — son écran d'accueil.
 *
 * 🔴 **Ce que c'était.** Un panneau de diagnostic : email, `PLAYER`, `ACTIVE`,
 * les valeurs brutes des enums dans un tableau. Un joueur venait de dessiner ses
 * postes sur un terrain, et atterrissait sur une sortie de débogage. Le club, en
 * face, avait déjà une configuration, un aperçu et des annonces.
 *
 * **Le terrain est la signature de l'app, pas un champ de formulaire.** Il ne
 * servait qu'à SAISIR des postes pendant l'inscription ; il devient ici la
 * représentation du joueur. C'est la seule chose que FootLink montre et
 * qu'aucun concurrent n'a — la réserver à un écran de saisie était du gâchis.
 *
 * En lecture seule (`onChange` inerte) : cet écran présente, il ne modifie pas.
 * La saisie reste dans le parcours d'inscription, qui porte déjà ses règles —
 * exactement un poste principal, pas de doublon.
 */
export default function Home(): ReactNode {
  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { user, signOut, authed } = useAuth();

  const [profile, setProfile] = useState<PlayerProfileResponse | null>();
  const [club, setClub] = useState<MyClubResponse | null>(null);
  const [banner, setBanner] = useState<string>();
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // `authed` et non `loadTokens` : un jeton lu directement est un instantané,
    // et il expire (décision 35 du HANDOFF).
    const [mine, myClub] = await Promise.all([
      authed((token) => getMyPlayerProfile(token)).catch(() => null),
      authed((token) => getMyClub(token)).catch(() => null),
    ]);
    setProfile(mine);
    setClub(myClub);
  }, [authed]);

  /*
   * 🔴 `useFocusEffect` et non `useEffect` : l'ecran se relit A CHAQUE RETOUR.
   *
   * Avec `useEffect`, la lecture n'avait lieu qu'au montage. Un ecran qu'on
   * quitte reste monte dans la pile : en revenant apres avoir cree une annonce,
   * on retrouvait la liste d'AVANT — « 0 annonce » alors qu'on venait d'en
   * creer une. Le contenu ne se reparait qu'en tirant pour rafraichir, ce que
   * personne ne fait pour verifier une action qu'il vient d'accomplir.
   */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Choix de la photo, puis téléversement direct vers le stockage.
   *
   * 🔴 **`expo-image-picker` est chargé ICI, pas en haut du fichier.** C'est un
   * module natif : un import de premier niveau fait échouer TOUT le module de
   * route sur un client de développement construit avant son ajout, et
   * l'application entière tombe. Chargé à l'appui, seul le choix de photo
   * échoue — avec un message.
   */
  const pickPhoto = async (): Promise<void> => {
    setBanner(undefined);

    let ImagePicker: typeof import('expo-image-picker');
    try {
      ImagePicker = await import('expo-image-picker');
    } catch {
      setBanner(t.home.photoUnavailable);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (!permission) {
      setBanner(t.home.photoUnavailable);
      return;
    }
    if (!permission.granted) {
      setBanner(t.home.photoDenied);
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Carré : la photo s'affiche en pastille ronde, un cadrage libre serait
      // rogné sans que la personne l'ait choisi.
      aspect: [1, 1],
      quality: 0.85,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) {
      return;
    }

    // Le type MIME annoncé au serveur doit être celui du fichier réellement
    // envoyé : l'URL pré-signée n'est valable que pour lui.
    const contentType = asset.mimeType ?? 'image/jpeg';
    setUploading(true);
    try {
      const ticket = await authed((token) => createAvatarUpload(token, contentType));
      await putToStorage(ticket.uploadUrl, asset.uri, contentType);
      await authed((token) => confirmAvatar(token, ticket.key));
      await load();
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setUploading(false);
    }
  };

  const dropPhoto = async (): Promise<void> => {
    setBanner(undefined);
    setUploading(true);
    try {
      await authed((token) => removeAvatar(token));
      await load();
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setUploading(false);
    }
  };

  // Un responsable de club doit savoir où en est sa demande : sans ça, l'écran
  // ne lui dit rien et il ne peut de toute façon rien faire tant que le club
  // n'est pas validé.
  const pendingClub = club?.canOperate === false;
  const primary = profile?.positions.find((position) => position.isPrimary)?.poste ?? null;
  const secondary = profile?.positions.filter((position) => !position.isPrimary) ?? [];

  return (
    <AppScreen
      title={profile ? `${profile.firstName} ${profile.lastName}` : t.home.title}
      /*
       * Le poste et la ligue sous le nom : c'est ce qui identifie un joueur de
       * football, bien avant son email. Un nom seul ne dit rien — « Gardien,
       * 4e ligue » dit tout ce qu'un club veut savoir en premier.
       */
      subtitle={
        pendingClub
          ? t.club.pendingBody
          : profile && primary
            ? [
                posteLabel(primary, locale),
                profile.currentCategory ? categoryLabel(profile.currentCategory, locale) : null,
                profile.locality,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
      }
      allowStackBack={false}
      onRefresh={() => void load()}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {profile === undefined ? <SkeletonCard /> : null}

      {profile === null ? (
        // Pas de profil joueur : c'est le cas d'un club ou d'un entraîneur qui
        // passe par ici. On ne lui invente pas une fiche de joueur.
        <Card>
          <Text fontSize={15} lineHeight={22} color="$brandChalkDim">
            {t.home.subtitle}
          </Text>
        </Card>
      ) : null}

      {profile ? (
        <>
          {/* Identité en HERO : un seul element principal par ecran. */}
          <Appear index={0}>
          <Card variant="hero">
            <XStack gap="$3.5" alignItems="center">
              <Avatar url={profile.avatarUrl} busy={uploading} />
              <YStack flexShrink={1} gap="$2">
                <XStack gap="$2" flexWrap="wrap">
                  <Badge
                    label={profile.isSeekingClub ? t.home.seeking : t.home.notSeeking}
                    tone={profile.isSeekingClub ? 'accent' : 'neutral'}
                  />
                  {!profile.isVisible ? <Badge label={t.home.hidden} tone="warning" /> : null}
                </XStack>
                <XStack gap="$3" flexWrap="wrap">
                  <Pressable onPress={() => void pickPhoto()} accessibilityRole="button">
                    <Text fontSize={14.5} fontWeight="700" color="$brandPitchBright">
                      {profile.avatarUrl ? t.home.photoChange : t.home.photoAdd}
                    </Text>
                  </Pressable>
                  {profile.avatarUrl ? (
                    <Pressable onPress={() => void dropPhoto()} accessibilityRole="button">
                      <Text fontSize={14.5} fontWeight="700" color="$brandChalkDim">
                        {t.home.photoRemove}
                      </Text>
                    </Pressable>
                  ) : null}
                </XStack>
              </YStack>
            </XStack>

            {/* Un profil masqué est invisible des clubs : le dire, sinon le
                joueur attend des propositions qui ne viendront jamais. */}
            {!profile.isVisible ? (
              <Text fontSize={13.5} lineHeight={20} color="#FFC14D">
                {t.home.hiddenHint}
              </Text>
            ) : null}
          </Card>
          </Appear>

          {/* 🔴 Le terrain, en grand. C'est la fiche du joueur. */}
          <Appear index={1}>
          <YStack gap="$2">
            <SectionTitle>{t.home.yourPitch}</SectionTitle>
            <PitchPositions
              value={{ primary, secondary: secondary.map((position) => position.poste) }}
              // Écran de présentation : le choix des postes appartient au
              // parcours d'inscription, qui porte ses règles de validation.
              onChange={() => undefined}
              readOnly
            />
          </YStack>
          </Appear>

          {/* Ce que le terrain ne dit PAS. Le poste principal n'y figure donc
              pas : `PitchPositions` l'annonce deja sous le dessin, et le
              repeter juste en dessous donnait la meme ligne deux fois. */}
          <Appear index={2}>
          <Card variant="plain">
            {/* La ligue est deja dans le sous-titre : on ne la repete pas. */}
            <Row
              label={t.home.currentClub}
              value={profile.currentClub?.name ?? profile.currentClubName ?? t.home.noClub}
            />
            {profile.strongFoot ? (
              <Row label={t.home.foot} value={strongFootLabel(profile.strongFoot, locale)} />
            ) : null}
            {profile.heightCm ? (
              <Row
                label={t.home.height}
                value={fill(t.home.heightValue, { cm: String(profile.heightCm) })}
              />
            ) : null}
          </Card>
          </Appear>

          {profile.bio ? (
            <Appear index={3}>
            <Card variant="plain">
              <Text fontSize={14.5} lineHeight={21} color="$brandChalk">
                {profile.bio}
              </Text>
            </Card>
            </Appear>
          ) : null}

          {/*
            Ce qui vient. Un écran qui s'arrête sur une fiche laisse croire que
            l'app est finie ; dire ce qui manque vaut mieux que le taire.
          */}
          <Appear index={4}>
            <EmptyState text={`${t.home.feedSoon} — ${t.home.feedSoonHint}`} />
          </Appear>
        </>
      ) : null}

      <PrimaryButton
        label={t.common.logout}
        variant="ghost"
        onPress={() => {
          void signOut().then(() => router.replace('/'));
        }}
      />

      {/* L'adresse reste visible : c'est elle qui identifie le compte, et un
          joueur qui en a deux doit pouvoir savoir laquelle il utilise. */}
      <Text fontSize={12.5} color="$brandChalkDim" textAlign="center">
        {user?.email ?? '—'}
      </Text>
    </AppScreen>
  );
}

/** Pastille ronde. Un ballon plutôt qu'une silhouette générique inventée. */
function Avatar({ url, busy }: { url: string | null; busy: boolean }): ReactNode {
  return (
    <YStack
      width={72}
      height={72}
      borderRadius={36}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      backgroundColor="rgba(7,19,15,0.75)"
      borderWidth={1.5}
      borderColor={url ? 'rgba(57,255,136,0.35)' : 'rgba(244,251,247,0.14)'}
      opacity={busy ? 0.5 : 1}
    >
      {url ? (
        <AppImage uri={url} size={72} />
      ) : (
        <BallIcon size={28} />
      )}
    </YStack>
  );
}

function Row({ label, value }: { label: string; value: string }): ReactNode {
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
