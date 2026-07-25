import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { createListing, MAX_SECONDARY_POSTES } from '@/api/listings';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { ListingForm, toPostes } from '@/ui/listing-form';
import type { PitchSelection } from '@/ui/pitch-positions';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Création d'une annonce pour une équipe.
 *
 * Deux boutons, et c'est voulu : **créer un brouillon** ou **créer et publier**.
 * Une annonce naît en brouillon côté serveur, parce qu'on l'écrit souvent en
 * plusieurs fois — mais forcer un aller-retour à celui qui sait déjà ce qu'il
 * veut serait une friction gratuite.
 *
 * Ni la saison ni le club ne sont envoyés : le serveur les détermine.
 */
export default function NewListing(): ReactNode {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { t } = useI18n();
  const { authed } = useAuth();

  const [positions, setPositions] = useState<PitchSelection>({ primary: null, secondary: [] });
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (publish: boolean): Promise<void> => {
    setBanner(undefined);
    const postes = toPostes(positions);
    if (!postes || !teamId) {
      setBanner(t.listings.posteRequired);
      return;
    }

    setBusy(true);
    try {
      await authed((token) =>
        createListing(token, {
          teamId,
          posteRecherche: postes.posteRecherche,
          ...(postes.secondaryPostes.length > 0
            ? { secondaryPostes: postes.secondaryPostes }
            : {}),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          publish,
        }),
      );
      // `replace` : revenir sur ce formulaire après création n'aurait aucun sens.
      router.replace({ pathname: '/club/listings', params: { teamId } });
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen
      title={t.listings.newTitle}
      subtitle={t.listings.newSubtitle}
      onBack={() => router.replace({ pathname: '/club/listings', params: { teamId } })}
    >
      {banner ? <FormBanner message={banner} /> : null}

      <ListingForm
        positions={positions}
        onPositionsChange={setPositions}
        description={description}
        onDescriptionChange={setDescription}
        maxSecondary={MAX_SECONDARY_POSTES}
      />

      <PrimaryButton
        label={t.listings.publish}
        loading={busy}
        onPress={() => void submit(true)}
      />
      <PrimaryButton
        label={t.listings.create}
        variant="ghost"
        loading={busy}
        onPress={() => void submit(false)}
      />
    </AppScreen>
  );
}
