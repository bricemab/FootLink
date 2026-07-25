import { categoryLabel } from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { createCoach } from '@/api/coaches';
import { listMyTeams, type Team } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail } from '@/ui/validation';

/**
 * Création d'un compte entraîneur.
 *
 * Le club saisit l'identité **avant** que le compte existe : c'est pour ça que
 * prénom et nom vivent sur `ClubMember` et non sur `User` (décision 33). Aucun
 * mot de passe n'est choisi ici — l'invité le définit lui-même avec le code à 6
 * chiffres reçu par email.
 *
 * Les équipes assignées sont facultatives, mais utiles d'emblée : sans aucune,
 * l'entraîneur se connectera sur un espace vide.
 */
export default function NewCoach(): ReactNode {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { authed } = useAuth();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setTeams(await authed((token) => listMyTeams(token)));
    } catch (error) {
      setBanner(toUserMessage(error, t));
    }
  }, [authed, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (teamId: string): void =>
    setSelected((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );

  const submit = async (): Promise<void> => {
    setBanner(undefined);
    setNameError(undefined);

    const invalidEmail = validateEmail(email, t);
    setEmailError(invalidEmail);
    if (invalidEmail) {
      return;
    }
    if (firstName.trim().length === 0 || lastName.trim().length === 0) {
      setNameError(t.errors.required);
      return;
    }

    setBusy(true);
    try {
      await authed((token) =>
        createCoach(token, {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          locale,
          ...(selected.length > 0 ? { teamIds: selected } : {}),
        }),
      );
      router.replace('/club/coaches');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t.coaches.newTitle} subtitle={t.coaches.newSubtitle}>
      {banner ? <FormBanner message={banner} /> : null}

      <TextField
        label={t.common.email}
        value={email}
        onChangeText={setEmail}
        placeholder="entraineur@exemple.ch"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={emailError}
      />
      <TextField
        label={t.coaches.firstName}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
      />
      <TextField
        label={t.coaches.lastName}
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        error={nameError}
      />

      <YStack gap="$2">
        <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
          {t.coaches.teamsLabel.toUpperCase()}
        </Text>
        <Text fontSize={13} color="$brandChalkDim">
          {t.coaches.teamsHint}
        </Text>

        {teams.length === 0 ? (
          <Text fontSize={13.5} color="$brandChalkDim">
            {t.teams.empty}
          </Text>
        ) : null}

        {teams.map((team) => {
          const active = selected.includes(team.id);
          return (
            <Pressable
              key={team.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => toggle(team.id)}
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
                <Text fontSize={15} color="$brandChalk" flexShrink={1}>
                  {team.name ?? categoryLabel(team.category, locale)}
                </Text>
                <Text
                  fontSize={13}
                  fontWeight="800"
                  color={active ? '$brandPitchBright' : '$brandChalkDim'}
                >
                  {active ? 'ON' : 'OFF'}
                </Text>
              </XStack>
            </Pressable>
          );
        })}
      </YStack>

      <PrimaryButton label={t.coaches.create} loading={busy} onPress={() => void submit()} />
    </AppScreen>
  );
}
