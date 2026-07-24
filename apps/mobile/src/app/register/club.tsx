import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { listRegions, requestClub, type Region } from '@/api/clubs';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { RegionPicker } from '@/ui/region-picker';
import { Stepper, StepTransition } from '@/ui/stepper';
import { TextField } from '@/ui/text-field';
import { useStepper } from '@/ui/use-stepper';
import { validateEmail, validatePassword } from '@/ui/validation';

/**
 * Demande de compte club, en trois étapes : le club, le compte du demandeur,
 * puis le contexte de la demande.
 *
 * Ce n'est pas une inscription ordinaire : le club naît en attente, et seul un
 * SUPER_ADMIN peut le débloquer. C'est ce qui garantit qu'aucun faux club ne
 * publie d'annonce — d'où la troisième étape, qui donne au valideur de quoi
 * décider.
 */
export default function RegisterClub(): ReactNode {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { adoptSession } = useAuth();

  const labels = [t.steps.clubIdentity, t.steps.clubAccount, t.steps.clubContext];
  const [current, setCurrent] = useState(0);
  const { stepLabel, nextLabel } = useStepper(labels, current);

  // On ne garde que les associations ouvertes : `active` est piloté en base,
  // ouvrir un canton se fait donc sans toucher à l'app (cf. AGENTS §2).
  const [openRegions, setOpenRegions] = useState<Region[]>([]);
  const [clubName, setClubName] = useState('');
  const [locality, setLocality] = useState('');
  const [regionCode, setRegionCode] = useState<string>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listRegions()
      .then((list) => {
        if (cancelled) {
          return;
        }
        const active = list.filter((region) => region.active);
        setOpenRegions(active);
        // Une seule association ouverte : rien à choisir, on la sélectionne.
        if (active.length === 1) {
          setRegionCode(active[0].code);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const goToAccount = (): void => {
    const invalid = clubName.trim().length === 0 ? t.errors.required : undefined;
    setErrors({ clubName: invalid });
    setBanner(undefined);
    if (!invalid) {
      setCurrent(1);
    }
  };

  const goToContext = (): void => {
    const next = { email: validateEmail(email, t), password: validatePassword(password, t) };
    setErrors(next);
    setBanner(undefined);
    if (!next.email && !next.password) {
      setCurrent(2);
    }
  };

  const submit = async (): Promise<void> => {
    setBanner(undefined);
    setBusy(true);
    try {
      const result = await requestClub({
        clubName: clubName.trim(),
        email,
        password,
        locale,
        ...(regionCode ? { regionCode } : {}),
        ...(locality.trim() ? { locality: locality.trim() } : {}),
        ...(note.trim() ? { requestNote: note.trim() } : {}),
      });
      // La demande ouvre déjà une session : l'email reste à valider, la garde
      // de routage enverra donc sur l'écran de confirmation.
      await adoptSession(result.tokens);
      router.replace('/');
    } catch (error) {
      const message = toUserMessage(error, t);
      setBanner(message);
      // Un email déjà pris se corrige à l'étape du compte.
      if (message === t.errors.emailTaken) {
        setCurrent(1);
      }
    } finally {
      setBusy(false);
    }
  };

  const label = (region: Region): string => (locale === 'DE' ? region.labelDe : region.labelFr);

  return (
    <AuthFormShell
      title={t.club.title}
      subtitle={t.club.subtitle}
      header={
        <Stepper steps={labels} current={current} stepLabel={stepLabel} nextLabel={nextLabel} />
      }
      {...(current > 0 ? { onBack: () => setCurrent(current - 1) } : {})}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {current === 0 ? (
        <StepTransition stepKey="club">
          <YStack gap="$4">
            <TextField
              label={t.club.clubName}
              value={clubName}
              onChangeText={setClubName}
              placeholder="FC Sion"
              autoCapitalize="words"
              error={errors.clubName}
            />

            <RegionPicker regions={openRegions} value={regionCode} onChange={setRegionCode} />

            <TextField
              label={t.club.locality}
              value={locality}
              onChangeText={setLocality}
              placeholder="Sion"
              autoCapitalize="words"
            />
            <PrimaryButton label={t.coach.next} onPress={goToAccount} />
          </YStack>
        </StepTransition>
      ) : null}

      {current === 1 ? (
        <StepTransition stepKey="account">
          <YStack gap="$4">
            <TextField
              label={t.common.email}
              value={email}
              onChangeText={setEmail}
              placeholder="contact@fcsion.ch"
              keyboardType="email-address"
              autoComplete="email"
              error={errors.email}
            />
            <YStack gap="$2">
              <TextField
                label={t.common.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                error={errors.password}
                onSubmitEditing={goToContext}
              />
              {errors.password ? null : (
                <Text fontSize={13} color="$brandChalkDim">
                  {t.register.passwordHint}
                </Text>
              )}
            </YStack>
            <PrimaryButton label={t.coach.next} onPress={goToContext} />
          </YStack>
        </StepTransition>
      ) : null}

      {current === 2 ? (
        <StepTransition stepKey="context">
          <YStack gap="$4">
            <TextField
              label={t.club.note}
              value={note}
              onChangeText={setNote}
              placeholder={t.club.notePlaceholder}
              autoCapitalize="sentences"
            />
            <PrimaryButton label={t.club.submit} loading={busy} onPress={() => void submit()} />
          </YStack>
        </StepTransition>
      ) : null}
    </AuthFormShell>
  );
}
