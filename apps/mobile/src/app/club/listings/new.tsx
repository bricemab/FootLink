import { categoryLabel } from '@footlink/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { createListing, MAX_SECONDARY_POSTES } from '@/api/listings';
import { listMyTeams, type Team } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { hapticError, hapticSuccess } from '@/ui/haptics';
import { CheckIcon } from '@/ui/icons';
import { ListingForm, toPostes } from '@/ui/listing-form';
import type { PitchSelection } from '@/ui/pitch-positions';
import { PrimaryButton } from '@/ui/primary-button';
import { TYPE } from '@/ui/type-scale';

/**
 * Création d'une annonce.
 *
 * L'équipe arrive **soit en paramètre** (on vient de son détail), **soit par un
 * choix** (on vient de l'onglet Annonces). C'est ce qui permet à l'onglet
 * d'exister : la question « pour quelle équipe ? » n'est posée que lorsque la
 * réponse n'est pas déjà connue, jamais deux fois.
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
  const { teamId: fromParams } = useLocalSearchParams<{ teamId?: string }>();
  const { t, locale } = useI18n();
  const { authed } = useAuth();

  const [teams, setTeams] = useState<Team[]>();
  const [teamId, setTeamId] = useState<string | undefined>(fromParams);
  const [positions, setPositions] = useState<PitchSelection>({ primary: null, secondary: [] });
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  /*
   * Les équipes ne sont chargées que si on arrive sans équipe. Les demander
   * dans l'autre cas serait un appel réseau dont personne ne verrait le
   * résultat.
   */
  const loadTeams = useCallback(async (): Promise<void> => {
    if (fromParams) {
      return;
    }
    try {
      const mine = await authed((token) => listMyTeams(token));
      setTeams(mine);
      // Une seule équipe : la question n'en est pas une, on y répond.
      if (mine.length === 1) {
        setTeamId(mine[0]?.id);
      }
    } catch (error) {
      setBanner(toUserMessage(error, t));
    }
  }, [authed, fromParams, t]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const submit = async (publish: boolean): Promise<void> => {
    setBanner(undefined);
    if (!teamId) {
      setBanner(t.listings.teamRequired);
      return;
    }
    const postes = toPostes(positions);
    if (!postes) {
      setBanner(t.listings.posteRequired);
      return;
    }

    setBusy(true);
    try {
      await authed((token) =>
        createListing(token, {
          teamId,
          posteRecherche: postes.posteRecherche,
          ...(postes.secondaryPostes.length > 0 ? { secondaryPostes: postes.secondaryPostes } : {}),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          publish,
        }),
      );
      hapticSuccess();
      // `replace` : revenir sur ce formulaire après création n'aurait aucun sens.
      router.replace(
        fromParams ? { pathname: '/club/listings', params: { teamId } } : '/club/listings',
      );
    } catch (error) {
      hapticError();
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  // Le choix n'apparaît que s'il y a vraiment un choix à faire.
  const chooseTeam = !fromParams && teams !== undefined && teams.length > 1;
  const noTeams = !fromParams && teams !== undefined && teams.length === 0;

  return (
    <AppScreen
      title={t.listings.newTitle}
      subtitle={t.listings.newSubtitle}
      onBack={() =>
        router.replace(
          fromParams
            ? { pathname: '/club/listings', params: { teamId: fromParams } }
            : '/club/listings',
        )
      }
    >
      {banner ? <FormBanner message={banner} /> : null}

      {!fromParams && teams === undefined ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {/* Sans équipe, une annonce n'a nulle part où aller : on le dit plutôt que
          de laisser remplir un formulaire qui finira en erreur. */}
      {noTeams ? <EmptyState text={t.listings.noTeams} /> : null}

      {chooseTeam ? (
        <YStack gap="$2">
          <Text {...TYPE.meta} color="$brandChalkDim">
            {t.listings.teamChoose.toUpperCase()}
          </Text>
          {teams?.map((team) => {
            const active = team.id === teamId;
            return (
              <Pressable
                key={team.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setTeamId(team.id)}
              >
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  gap="$3"
                  paddingVertical="$3"
                  paddingHorizontal="$3.5"
                  borderRadius={14}
                  borderWidth={1.5}
                  borderColor={active ? '#39FF88' : 'rgba(244,251,247,0.14)'}
                  backgroundColor="rgba(14,36,28,0.7)"
                >
                  <YStack flexShrink={1} gap="$0.5">
                    <Text {...TYPE.body} color="$brandChalk" flexShrink={1}>
                      {team.name ?? categoryLabel(team.category, locale)}
                    </Text>
                    {team.name ? (
                      <Text {...TYPE.label} color="$brandChalkDim">
                        {categoryLabel(team.category, locale)}
                      </Text>
                    ) : null}
                  </YStack>
                  {active ? <CheckIcon /> : null}
                </XStack>
              </Pressable>
            );
          })}
        </YStack>
      ) : null}

      {!noTeams ? (
        <>
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
        </>
      ) : null}
    </AppScreen>
  );
}
