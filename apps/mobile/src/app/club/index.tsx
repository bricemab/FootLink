import { regionForCanton } from '@footlink/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  confirmClubLogo,
  createClubLogoUpload,
  putToStorage,
  removeClubLogo,
} from '@/api/club-logo';
import { getMyClub, listRegions, updateMyClub, type MyClubResponse, type Region } from '@/api/clubs';
import { listCoaches } from '@/api/coaches';
import type { ResolvedPlace } from '@/api/geo';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { CoachIcon, ChevronIcon, EyeIcon, StadiumIcon } from '@/ui/icons';
import { PlacePicker } from '@/ui/place-picker';
import { RegionPicker } from '@/ui/region-picker';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail } from '@/ui/validation';

/**
 * Configuration du club — onglet d'accueil de l'espace club.
 *
 * Remplace un tableau de bord qui ne faisait qu'aiguiller : un écran
 * d'aiguillage n'apprend rien et ajoute un appui avant chaque chose utile. Tout
 * ce qui compose la fiche vue par les joueurs se règle ici, et l'onglet
 * « Aperçu » en montre le résultat.
 *
 * Ouvert même à un club encore `PENDING` : préparer sa fiche pendant l'attente
 * est légitime, la publier ne l'est pas. Seules les équipes et les entraîneurs
 * exigent l'approbation (AGENTS §4bis).
 */
export default function ClubConfig(): ReactNode {
  const router = useRouter();
  const { t, fill } = useI18n();
  const { authed, signOut, user } = useAuth();

  const [club, setClub] = useState<MyClubResponse | null>(null);
  const [coachCount, setCoachCount] = useState<number>();
  const [openRegions, setOpenRegions] = useState<Region[]>([]);
  const [regionCode, setRegionCode] = useState<string>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [showContactEmail, setShowContactEmail] = useState(false);
  const [pitch, setPitch] = useState<ResolvedPlace>();
  const [movingPitch, setMovingPitch] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    try {
      const mine = await authed((token) => getMyClub(token));
      setClub(mine);
      if (mine) {
        setName(mine.club.name);
        setDescription(mine.club.description ?? '');
        setWebsite(mine.club.websiteUrl ?? '');
        setContactEmail(mine.club.contactEmail ?? '');
        setShowContactEmail(mine.club.showContactEmail);
        setRegionCode(mine.club.regionCode ?? undefined);
      }
      // Le decompte des entraineurs vient de la meme liste que leur ecran : pas
      // d'endpoint de statistiques a maintenir, donc jamais deux chiffres qui
      // divergent. Inutile de le demander si le club n'est pas encore valide,
      // l'API repondrait 403.
      setCoachCount(
        mine?.canOperate === true
          ? (await authed((token) => listCoaches(token)).catch(() => [])).length
          : undefined,
      );
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, t]);

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

  /*
   * Associations ouvertes.
   *
   * `active` est pilote en base : ouvrir un canton ne demande aucune livraison.
   * Le selecteur se tait de lui-meme s'il n'y en a qu'une -- il n'y a alors rien
   * a choisir, seulement a informer.
   */
  useEffect(() => {
    let cancelled = false;
    void listRegions()
      .then((list) => {
        if (!cancelled) {
          setOpenRegions(list.filter((region) => region.active));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (): Promise<void> => {
    setBanner(undefined);
    setNotice(undefined);
    setEmailError(undefined);

    // L'adresse n'est vérifiée que si elle est renseignée : elle est facultative,
    // et un champ vide veut dire « pas d'adresse », pas « adresse invalide ».
    if (contactEmail.trim().length > 0) {
      const invalid = validateEmail(contactEmail, t);
      if (invalid) {
        setEmailError(invalid);
        return;
      }
    }

    setBusy(true);
    try {
      await authed((token) =>
        updateMyClub(token, {
          // Nom envoye seulement s'il en reste un : vide, il effacerait le nom du
          // club. Le serveur le refuse aussi (MinLength), mais autant ne pas
          // fabriquer une requete qu'on sait mauvaise.
          ...(name.trim().length > 0 ? { name: name.trim() } : {}),
          // La presentation, elle, peut legitimement etre videe : la chaine vide
          // est donc une valeur, pas une absence.
          description: description.trim(),
          ...(website.trim().length > 0 ? { websiteUrl: website.trim() } : {}),
          ...(contactEmail.trim().length > 0 ? { contactEmail: contactEmail.trim() } : {}),
          showContactEmail,
          ...(regionCode ? { regionCode } : {}),
          // Terrain déplacé : on n'envoie que le point et son libellé, jamais le
          // canton ni la commune — le serveur les recalcule depuis le point.
          ...(pitch
            ? {
                lat: pitch.lat,
                lng: pitch.lng,
                stadiumName: pitch.label,
                addressLine: pitch.label,
              }
            : {}),
        }),
      );
      setPitch(undefined);
      setMovingPitch(false);
      setNotice(t.clubSpace.saved);
      await load();
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Choix du logo, puis téléversement direct vers le stockage.
   *
   * Le type MIME annoncé au serveur doit être celui du fichier réellement
   * envoyé : l'URL pré-signée n'est valable que pour lui.
   *
   * 🔴 **`expo-image-picker` est chargé ICI, pas en haut du fichier.** C'est un
   * module natif : sur un client de développement construit avant son ajout,
   * un import de premier niveau fait échouer **tout le module de route**, donc
   * l'écran ne s'exporte plus et l'application entière tombe
   * (`Cannot read property 'ErrorBoundary' of undefined`). Chargé à l'appui,
   * seul le choix du logo échoue, avec un message — le reste de l'app vit.
   */
  const pickLogo = async (): Promise<void> => {
    setBanner(undefined);
    setNotice(undefined);

    let ImagePicker: typeof import('expo-image-picker');
    try {
      ImagePicker = await import('expo-image-picker');
    } catch {
      setBanner(t.clubSpace.logoUnavailable);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (!permission) {
      // Module présent mais natif absent : la promesse rejette.
      setBanner(t.clubSpace.logoUnavailable);
      return;
    }
    if (!permission.granted) {
      setBanner(t.clubSpace.logoDenied);
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    // Annuler n'est pas une erreur : on ne dit rien.
    if (picked.canceled || picked.assets.length === 0) {
      return;
    }

    const asset = picked.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';

    setUploading(true);
    try {
      const ticket = await authed((token) => createClubLogoUpload(token, contentType));
      await putToStorage(ticket.uploadUrl, asset.uri, contentType);
      // La confirmation rattache la clé au club : sans elle, l'objet reste
      // orphelin dans le bucket et le logo ne change pas.
      await authed((token) => confirmClubLogo(token, ticket.key));
      await load();
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setUploading(false);
    }
  };

  const dropLogo = async (): Promise<void> => {
    setBanner(undefined);
    setUploading(true);
    try {
      await authed((token) => removeClubLogo(token));
      await load();
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setUploading(false);
    }
  };

  const canOperate = club?.canOperate === true;
  const region = club?.club.regionCode ?? regionForCanton(club?.club.canton ?? '');

  /*
    ⚠️ **`href: null` retire l'onglet de la barre, PAS la route.** `/club` resout
    toujours ici, et c'est la premiere chose qu'atteint un entraineur qui entre
    dans l'espace club : il verrait la configuration du club, sur laquelle
    l'API lui repondrait 403. On redirige donc vers ce qui le concerne — ses
    equipes.
  */
  if (user?.role === 'COACH') {
    return <Redirect href="/club/teams" />;
  }

  return (
    <AppScreen
      title={t.clubSpace.configTitle}
      subtitle={t.clubSpace.configSubtitle}
      allowStackBack={false}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}
      {notice ? (
        <Text fontSize={14} fontWeight="700" color="$brandPitchBright">
          {notice}
        </Text>
      ) : null}

      {loading && !club ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {club ? (
        <>
          {!canOperate ? <FormBanner message={t.clubSpace.pendingNotice} /> : null}

          <Card>
            <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
              {t.clubSpace.logo.toUpperCase()}
            </Text>
            <XStack alignItems="center" gap="$3.5">
              <LogoThumb url={club.logoUrl} busy={uploading} />
              <YStack gap="$2" flexShrink={1}>
                <XStack gap="$3.5" flexWrap="wrap">
                  <TextAction
                    label={club.logoUrl ? t.clubSpace.logoChange : t.clubSpace.logoAdd}
                    disabled={uploading}
                    onPress={() => void pickLogo()}
                  />
                  {club.logoUrl ? (
                    <TextAction
                      label={t.clubSpace.logoRemove}
                      disabled={uploading}
                      onPress={() => void dropLogo()}
                    />
                  ) : null}
                </XStack>
                <Text fontSize={12.5} color="$brandChalkDim">
                  {t.clubSpace.logoHint}
                </Text>
              </YStack>
            </XStack>
          </Card>

          <TextField
            label={t.clubSpace.name}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <TextField
            label={t.clubSpace.description}
            value={description}
            onChangeText={setDescription}
            placeholder={t.clubSpace.descriptionPlaceholder}
            multiline
          />

          <TextField
            label={t.club.website}
            value={website}
            onChangeText={setWebsite}
            placeholder={t.club.websitePlaceholder}
            keyboardType="url"
            autoCapitalize="none"
          />

          <TextField
            label={t.clubSpace.contactEmail}
            value={contactEmail}
            onChangeText={setContactEmail}
            placeholder="contact@fcsion.ch"
            keyboardType="email-address"
            autoCapitalize="none"
            error={emailError}
          />

          {/* Publier une adresse email est un choix, pas un défaut. */}
          <Card onPress={() => setShowContactEmail(!showContactEmail)} accent={showContactEmail}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <Text fontSize={16} fontWeight="700" color="$brandChalk" flexShrink={1}>
                {t.clubSpace.contactEmailShow}
              </Text>
              <Text
                fontSize={15}
                fontWeight="800"
                color={showContactEmail ? '$brandPitchBright' : '$brandChalkDim'}
              >
                {showContactEmail ? 'ON' : 'OFF'}
              </Text>
            </XStack>
            <Text fontSize={13.5} color="$brandChalkDim">
              {showContactEmail ? t.clubSpace.contactEmailShown : t.clubSpace.contactEmailHidden}
            </Text>
          </Card>

          {/*
            Association regionale.

            Elle se DEDUIT du terrain a l'inscription, mais reste corrigeable :
            quelques clubs sont a cheval sur deux associations, et le canton ne
            tranche pas pour eux. Le serveur la revalide de toute facon.
          */}
          <RegionPicker
            regions={openRegions}
            value={regionCode}
            onChange={setRegionCode}
          />

          {/* Terrain en lecture, remplaçable à la demande. Canton et commune
              suivent le point, recalculés serveur. */}
          {movingPitch ? (
            <PlacePicker
              authed={authed}
              value={pitch}
              onChange={setPitch}
              copy={{
                label: t.club.pitch,
                placeholder: t.club.pitchPlaceholder,
                help: t.club.pitchHelp,
              }}
            />
          ) : (
            <Card>
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <XStack alignItems="center" gap="$2.5" flexShrink={1}>
                  <StadiumIcon size={20} />
                  <Text fontSize={15} color="$brandChalk" flexShrink={1}>
                    {club.club.stadiumName ?? club.club.addressLine ?? t.clubSpace.noPitch}
                  </Text>
                </XStack>
                <TextAction label={t.clubSpace.pitchChange} onPress={() => setMovingPitch(true)} />
              </XStack>
              <XStack gap="$2" alignItems="center">
                {club.club.locality ? (
                  <Text fontSize={13} color="$brandChalkDim">
                    {club.club.canton
                      ? `${club.club.locality} (${club.club.canton})`
                      : club.club.locality}
                  </Text>
                ) : null}
                {region ? <Badge label={region} /> : null}
              </XStack>
            </Card>
          )}

          <PrimaryButton label={t.clubSpace.save} loading={busy} onPress={() => void save()} />

          {/* Les entraineurs vivent ici, pas dans la barre du bas : on en ajoute
              un par saison. La barre est reservee a ce qu'on ouvre tous les
              jours. */}
          {canOperate ? (
            <Card onPress={() => router.push('/club/coaches')}>
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <XStack alignItems="center" gap="$2.5" flexShrink={1}>
                  <CoachIcon size={20} />
                  <Text fontSize={16} fontWeight="700" color="$brandChalk" flexShrink={1}>
                    {t.clubSpace.coaches}
                  </Text>
                </XStack>
                <XStack alignItems="center" gap="$2">
                  <Text fontSize={15} fontWeight="700" color="$brandPitchBright">
                    {coachCount === undefined
                      ? '—'
                      : fill(t.clubSpace.countCoaches, { count: String(coachCount) })}
                  </Text>
                  <ChevronIcon direction="right" />
                </XStack>
              </XStack>
              <Text fontSize={13.5} color="$brandChalkDim">
                {t.clubSpace.coachesHint}
              </Text>
            </Card>
          ) : null}

          {/* L'apercu est ici, en DERNIER, et plus dans la barre du bas : c'est
              une verification qu'on fait juste apres avoir modifie sa fiche,
              donc au bout de l'ecran qu'on vient de remplir. Ce n'est pas un
              endroit ou l'on va, et la barre n'a que cinq places. */}
          <Card onPress={() => router.push('/club/preview')}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <XStack alignItems="center" gap="$2.5" flexShrink={1}>
                <EyeIcon size={20} />
                <Text fontSize={16} fontWeight="700" color="$brandChalk" flexShrink={1}>
                  {t.clubSpace.previewCard}
                </Text>
              </XStack>
              <ChevronIcon direction="right" />
            </XStack>
            <Text fontSize={13.5} color="$brandChalkDim">
              {t.clubSpace.previewHint}
            </Text>
          </Card>
        </>
      ) : null}

      {/*
        🔴 Deconnexion, et elle est ICI parce qu'elle n'etait NULLE PART.

        Un admin de club atterrit sur `/club` et n'y passe jamais par `/home`,
        qui portait le seul bouton de deconnexion de l'app : il ne pouvait donc
        pas quitter sa session. Signale par Brice.

        En dernier, apres tout le reste, et en `ghost` : c'est une sortie, pas une
        action qu'on propose. Elle reste visible meme quand le club n'est pas
        encore valide -- c'est justement le cas ou l'on peut vouloir partir.
      */}
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

/** Vignette carrée du logo, ou un cadre vide qui ne prétend rien. */
function LogoThumb({ url, busy }: { url: string | null; busy: boolean }): ReactNode {
  return (
    <YStack
      width={76}
      height={76}
      borderRadius={18}
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      borderWidth={1.5}
      borderColor="rgba(244,251,247,0.16)"
      backgroundColor="rgba(7,19,15,0.7)"
    >
      {busy ? <ActivityIndicator color="#39FF88" /> : null}
      {!busy && url ? (
        <Image source={{ uri: url }} style={{ width: 76, height: 76 }} resizeMode="cover" />
      ) : null}
      {!busy && !url ? <StadiumIcon size={30} /> : null}
    </YStack>
  );
}

/** Action secondaire en texte : évite d'empiler des gros boutons dans une carte. */
function TextAction({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" disabled={disabled} hitSlop={8}>
      {({ pressed }) => (
        <Text
          fontSize={14.5}
          fontWeight="700"
          color="$brandPitchBright"
          opacity={disabled ? 0.4 : pressed ? 0.6 : 1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
