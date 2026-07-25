import type { CategoryCode, Gender } from '@footlink/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  deleteTeam,
  getTeam,
  getTeamDeletionImpact,
  updateTeam,
  type Team,
  type TeamDeletionImpact,
} from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Card } from '@/ui/app-screen';
import { ChevronIcon } from '@/ui/icons';
import { CategoryPicker } from '@/ui/category-picker';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GenderChoice } from '@/ui/gender-choice';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';

/**
 * Édition d'une équipe, et sa suppression.
 *
 * 🔴 **La suppression n'est jamais proposée à l'aveugle.** Elle détruit en
 * cascade les annonces, les candidatures, les matchs, les conversations et les
 * messages de l'équipe. Le premier appui ne supprime rien : il va chercher le
 * décompte exact auprès du serveur (`GET /teams/:id/deletion-impact`) et
 * l'affiche. Le bouton de confirmation n'existe qu'ensuite.
 *
 * L'API impose la même discipline de son côté — sans `confirm=true` elle répond
 * 409 avec le décompte — mais on ne s'appuie pas là-dessus pour construire
 * l'alerte : un refus attrapé en catch serait un chemin d'erreur, pas un
 * dialogue.
 */
export default function TeamDetail(): ReactNode {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, fill } = useI18n();
  const { authed } = useAuth();

  const [team, setTeam] = useState<Team>();
  const [gender, setGender] = useState<Gender>('MALE');
  const [category, setCategory] = useState<CategoryCode>();
  const [name, setName] = useState('');
  const [impact, setImpact] = useState<TeamDeletionImpact>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }
    setBanner(undefined);
    try {
      const found = await authed((token) => getTeam(token, id));
      setTeam(found);
      setGender(found.gender);
      setCategory(found.category);
      setName(found.name ?? '');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    if (!id || !category) {
      return;
    }
    setBanner(undefined);
    setBusy(true);
    try {
      await authed((token) =>
        updateTeam(token, id, {
          category,
          gender,
          // Champ vidé = on retire le nom, d'où la chaîne vide plutôt qu'un
          // champ absent (qui, lui, voudrait dire « ne touche pas »).
          name: name.trim(),
        }),
      );
      router.replace('/club/teams');
    } catch (error) {
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
      setImpact(await authed((token) => getTeamDeletionImpact(token, id)));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /** Second appui, une fois le décompte affiché. Irréversible. */
  const confirmDelete = async (): Promise<void> => {
    if (!id) {
      return;
    }
    setBanner(undefined);
    setBusy(true);
    try {
      await authed((token) => deleteTeam(token, id));
      router.replace('/club/teams');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen
      title={t.teams.editTitle}
      subtitle={team?.name ?? undefined}
      onBack={() => router.replace('/club/teams')}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {loading ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {team ? (
        <>
          <GenderChoice label={t.teams.gender} value={gender}
            onChange={(next) => {
              setGender(next);
              setCategory(undefined);
            }}
          />

          <CategoryPicker gender={gender} value={category} onChange={setCategory} />

          <YStack gap="$1.5">
            <TextField
              label={t.teams.nameLabel}
              value={name}
              onChangeText={setName}
              placeholder={t.teams.namePlaceholder}
              autoCapitalize="words"
            />
            <Text fontSize={13} color="$brandChalkDim">
              {t.teams.nameHint}
            </Text>
          </YStack>

          <PrimaryButton label={t.teams.save} loading={busy} onPress={() => void save()} />

          {/* Les annonces appartiennent a l'equipe : on y entre d'ici, et non
              par un onglet global qui redemanderait « laquelle ? ». */}
          <Card onPress={() => router.push({ pathname: '/club/listings', params: { teamId: id } })}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <Text fontSize={16} fontWeight="700" color="$brandChalk" flexShrink={1}>
                {t.teams.listingsTitle}
              </Text>
              <ChevronIcon direction="right" />
            </XStack>
            <Text fontSize={13.5} color="$brandChalkDim">
              {t.teams.listingsHint}
            </Text>
          </Card>

          {/* Zone de suppression, séparée du reste : elle ne doit pas se
              confondre avec l'enregistrement. */}
          {impact === undefined ? (
            <PrimaryButton
              label={t.teams.delete}
              variant="ghost"
              loading={busy}
              onPress={() => void askDelete()}
            />
          ) : (
            <Card>
              <Text fontSize={17} fontWeight="800" color="$brandChalk">
                {t.teams.deleteTitle}
              </Text>
              <Text fontSize={14.5} lineHeight={21} color="$brandChalkDim">
                {impact.isEmpty
                  ? t.teams.deleteEmpty
                  : fill(t.teams.deleteImpact, {
                      listings: String(impact.listings),
                      applications: String(impact.applications),
                      matches: String(impact.matches),
                      conversations: String(impact.conversations),
                      messages: String(impact.messages),
                    })}
              </Text>
              <PrimaryButton
                label={t.teams.deleteConfirm}
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
