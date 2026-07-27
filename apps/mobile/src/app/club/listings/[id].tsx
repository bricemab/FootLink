import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  deleteListing,
  getListing,
  getListingDeletionImpact,
  MAX_SECONDARY_POSTES,
  updateListing,
  type Listing,
  type ListingDeletionImpact,
} from '@/api/listings';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { hapticError, hapticSuccess } from '@/ui/haptics';
import { ListingForm, toPostes } from '@/ui/listing-form';
import { statusLabel, statusTone } from '@/ui/listing-status';
import type { PitchSelection } from '@/ui/pitch-positions';
import { PrimaryButton } from '@/ui/primary-button';


/**
 * Modification d'une annonce, changement de statut et suppression.
 *
 * 🔴 **La suppression n'est jamais proposée à l'aveugle** — même discipline que
 * les équipes. Le premier appui va chercher le décompte auprès du serveur, le
 * bouton de confirmation n'existe qu'ensuite. On ne s'appuie pas sur le 409 de
 * l'API pour construire l'alerte : un refus attrapé en catch serait un chemin
 * d'erreur, pas un dialogue.
 *
 * `EXPIRED` n'est jamais proposé : ce statut appartient à l'ordonnanceur. Une
 * annonce échue se republie, ce qui la repasse en `ACTIVE`.
 */
export default function ListingDetail(): ReactNode {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, fill } = useI18n();
  const { authed } = useAuth();

  const [listing, setListing] = useState<Listing>();
  const [positions, setPositions] = useState<PitchSelection>({ primary: null, secondary: [] });
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState<ListingDeletionImpact>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }
    setBanner(undefined);
    try {
      const found = await authed((token) => getListing(token, id));
      setListing(found);
      setPositions({ primary: found.posteRecherche, secondary: found.secondaryPostes });
      setDescription(found.description ?? '');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, id, t]);

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

  const save = async (): Promise<void> => {
    if (!id) {
      return;
    }
    const postes = toPostes(positions);
    if (!postes) {
      setBanner(t.listings.posteRequired);
      return;
    }
    setBanner(undefined);
    setBusy(true);
    try {
      await authed((token) =>
        updateListing(token, id, {
          posteRecherche: postes.posteRecherche,
          secondaryPostes: postes.secondaryPostes,
          // Chaîne vide = on efface les précisions ; c'est une valeur, pas une
          // absence.
          description: description.trim(),
        }),
      );
      await load();
      setBanner(undefined);
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'DRAFT' | 'ACTIVE' | 'CLOSED'): Promise<void> => {
    if (!id) {
      return;
    }
    setBanner(undefined);
    setBusy(true);
    try {
      await authed((token) => updateListing(token, id, { status }));
      // Publier ou clore engage : ca doit se sentir, pas seulement s'afficher.
      hapticSuccess();
      await load();
    } catch (error) {
      hapticError();
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /** Premier appui : on va chercher ce que la suppression détruirait. */
  const askDelete = async (): Promise<void> => {
    if (!id) {
      return;
    }
    setBanner(undefined);
    setBusy(true);
    try {
      setImpact(await authed((token) => getListingDeletionImpact(token, id)));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /** Second appui, une fois le décompte affiché. Irréversible. */
  const confirmDelete = async (): Promise<void> => {
    if (!id || !listing) {
      return;
    }
    setBanner(undefined);
    setBusy(true);
    try {
      await authed((token) => deleteListing(token, id));
      router.replace({ pathname: '/club/listings', params: { teamId: listing.teamId } });
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen
      title={t.listings.editTitle}
      subtitle={listing ? fill(t.listings.season, { season: listing.season }) : undefined}
      onBack={() =>
        router.replace(
          listing
            ? { pathname: '/club/listings', params: { teamId: listing.teamId } }
            : '/club/teams',
        )
      }
    >
      {banner ? <FormBanner message={banner} /> : null}

      {loading ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {listing ? (
        <>
          <XStack alignItems="center" justifyContent="space-between" gap="$3">
            <Badge label={statusLabel(listing.status, t)} tone={statusTone(listing.status)} />
            <Text
              fontSize={14}
              fontWeight="700"
              color={listing.applicationCount > 0 ? '$brandPitchBright' : '$brandChalkDim'}
            >
              {fill(t.listings.applications, { count: String(listing.applicationCount) })}
            </Text>
          </XStack>

          {/* Dire ce que le statut IMPLIQUE, pas seulement son nom : un
              brouillon invisible sans explication passe pour un bug. */}
          {listing.status === 'DRAFT' ? <FormBanner message={t.listings.draftNotice} /> : null}
          {listing.status === 'EXPIRED' ? <FormBanner message={t.listings.expiredNotice} /> : null}

          <ListingForm
            positions={positions}
            onPositionsChange={setPositions}
            description={description}
            onDescriptionChange={setDescription}
            maxSecondary={MAX_SECONDARY_POSTES}
          />

          <PrimaryButton label={t.listings.save} loading={busy} onPress={() => void save()} />

          {listing.status === 'ACTIVE' ? (
            <>
              <PrimaryButton
                label={t.listings.unpublish}
                variant="ghost"
                loading={busy}
                onPress={() => void setStatus('DRAFT')}
              />
              <PrimaryButton
                label={t.listings.close}
                variant="ghost"
                loading={busy}
                onPress={() => void setStatus('CLOSED')}
              />
            </>
          ) : (
            <PrimaryButton
              label={listing.status === 'DRAFT' ? t.listings.publish : t.listings.reopen}
              variant="ghost"
              loading={busy}
              onPress={() => void setStatus('ACTIVE')}
            />
          )}

          {impact === undefined ? (
            <PrimaryButton
              label={t.listings.delete}
              variant="ghost"
              loading={busy}
              onPress={() => void askDelete()}
            />
          ) : (
            <Card>
              <Text fontSize={17} fontWeight="800" color="$brandChalk">
                {t.listings.deleteTitle}
              </Text>
              <Text fontSize={14.5} lineHeight={21} color="$brandChalkDim">
                {impact.isEmpty
                  ? t.listings.deleteEmpty
                  : fill(t.listings.deleteImpact, {
                      applications: String(impact.applications),
                      matches: String(impact.matches),
                      conversations: String(impact.conversations),
                      messages: String(impact.messages),
                    })}
              </Text>
              <PrimaryButton
                label={t.listings.deleteConfirm}
                loading={busy}
                onPress={() => void confirmDelete()}
              />
              <Pressable onPress={() => setImpact(undefined)} accessibilityRole="button">
                <Text fontSize={15} fontWeight="700" color="$brandChalkDim" textAlign="center">
                  {t.teams.cancel}
                </Text>
              </Pressable>
            </Card>
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
