import type { CategoryCode, Gender } from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { createTeam } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Card } from '@/ui/app-screen';
import { CategoryPicker } from '@/ui/category-picker';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GenderChoice } from '@/ui/gender-choice';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail } from '@/ui/validation';

/**
 * Création d'une équipe, avec son entraîneur en option.
 *
 * Les deux sont créés dans la **même transaction** côté serveur : si l'email de
 * l'entraîneur est refusé, aucune équipe orpheline ne subsiste. C'est pour ça
 * que l'écran envoie un seul appel plutôt que deux.
 */
export default function NewTeam(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const { authed } = useAuth();

  const [gender, setGender] = useState<Gender>('MALE');
  const [category, setCategory] = useState<CategoryCode>();
  const [name, setName] = useState('');
  const [withCoach, setWithCoach] = useState(false);
  const [coachEmail, setCoachEmail] = useState('');
  const [coachFirstName, setCoachFirstName] = useState('');
  const [coachLastName, setCoachLastName] = useState('');
  const [categoryError, setCategoryError] = useState<string>();
  const [coachError, setCoachError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  /**
   * Changer de genre peut invalider la catégorie choisie : les ligues féminines
   * et masculines sont deux listes distinctes. On efface plutôt que de laisser
   * une 3e ligue masculine sur une équipe féminine.
   */
  const changeGender = (next: Gender): void => {
    setGender(next);
    setCategory(undefined);
    setCategoryError(undefined);
  };

  const submit = async (): Promise<void> => {
    setBanner(undefined);
    setCategoryError(undefined);
    setCoachError(undefined);

    if (!category) {
      setCategoryError(t.errors.required);
      return;
    }
    if (withCoach) {
      const emailError = validateEmail(coachEmail, t);
      if (emailError) {
        setCoachError(emailError);
        return;
      }
      if (coachFirstName.trim().length === 0 || coachLastName.trim().length === 0) {
        setCoachError(t.errors.required);
        return;
      }
    }

    setBusy(true);
    try {
      await authed((token) =>
        createTeam(token, {
          category,
          gender,
          ...(name.trim().length > 0 ? { name: name.trim() } : {}),
          ...(withCoach
            ? {
                coach: {
                  email: coachEmail.trim(),
                  firstName: coachFirstName.trim(),
                  lastName: coachLastName.trim(),
                },
              }
            : {}),
        }),
      );
      // `replace` et non `push` : revenir sur ce formulaire après création
      // n'aurait aucun sens, et la liste doit se recharger.
      router.replace('/club/teams');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t.teams.newTitle} subtitle={t.teams.newSubtitle}>
      {banner ? <FormBanner message={banner} /> : null}

      <GenderChoice label={t.teams.gender} value={gender} onChange={changeGender} />

      <CategoryPicker
        gender={gender}
        value={category}
        onChange={(next) => {
          setCategory(next);
          setCategoryError(undefined);
        }}
        error={categoryError}
      />

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

      <Card onPress={() => setWithCoach(!withCoach)} accent={withCoach}>
        <XStack alignItems="center" justifyContent="space-between" gap="$3">
          <Text fontSize={16} fontWeight="700" color="$brandChalk" flexShrink={1}>
            {t.teams.withCoach}
          </Text>
          <Text fontSize={15} fontWeight="800" color={withCoach ? '$brandPitchBright' : '$brandChalkDim'}>
            {withCoach ? 'ON' : 'OFF'}
          </Text>
        </XStack>
        <Text fontSize={13.5} color="$brandChalkDim">
          {t.teams.withCoachHint}
        </Text>
      </Card>

      {withCoach ? (
        <YStack gap="$4">
          <TextField
            label={t.common.email}
            value={coachEmail}
            onChangeText={setCoachEmail}
            placeholder="entraineur@exemple.ch"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={coachError}
          />
          <TextField
            label={t.coaches.firstName}
            value={coachFirstName}
            onChangeText={setCoachFirstName}
            autoCapitalize="words"
          />
          <TextField
            label={t.coaches.lastName}
            value={coachLastName}
            onChangeText={setCoachLastName}
            autoCapitalize="words"
          />
        </YStack>
      ) : null}

      <PrimaryButton label={t.teams.create} loading={busy} onPress={() => void submit()} />
    </AppScreen>
  );
}
