import { PASSWORD_MIN_LENGTH } from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { useSignedInRedirect } from '@/auth/signed-in-guard';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GoogleAuthSection } from '@/ui/google-auth-section';
import { PrimaryButton } from '@/ui/primary-button';
import { Stepper, StepTransition } from '@/ui/stepper';
import { TextField } from '@/ui/text-field';
import { useStepper } from '@/ui/use-stepper';
import { validateEmail, validatePassword } from '@/ui/validation';

/**
 * Inscription joueur, en deux étapes.
 *
 * Un champ à la fois : on ne demande le mot de passe qu'une fois l'email jugé
 * valide, et le stepper annonce d'avance ce qui reste. Google court-circuite
 * les deux étapes, il reste donc proposé dès la première.
 */
export default function RegisterPlayer(): ReactNode {
  // Deja connecte : cet ecran n'a plus d'objet. Voir `useSignedInRedirect`.
  const signedIn = useSignedInRedirect();
  if (signedIn) {
    return signedIn;
  }

  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { signUp } = useAuth();

  const labels = [t.steps.email, t.steps.password];
  const [current, setCurrent] = useState(0);
  const { stepLabel, nextLabel } = useStepper(labels, current);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const goToPassword = (): void => {
    const invalid = validateEmail(email, t);
    setFieldError(invalid);
    setBanner(undefined);
    if (!invalid) {
      setFieldError(undefined);
      setCurrent(1);
    }
  };

  const submit = async (): Promise<void> => {
    const invalid = validatePassword(password, t);
    setFieldError(invalid);
    setBanner(undefined);
    if (invalid) {
      return;
    }
    setBusy(true);
    try {
      await signUp(email, password, locale);
      router.replace('/');
    } catch (error) {
      const message = toUserMessage(error, t);
      setBanner(message);
      // Un email déjà pris se corrige à l'étape 1, pas sur le mot de passe.
      if (message === t.errors.emailTaken) {
        setCurrent(0);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFormShell
      title={t.register.title}
      subtitle={t.register.subtitle}
      header={
        <Stepper steps={labels} current={current} stepLabel={stepLabel} nextLabel={nextLabel} />
      }
      {...(current > 0 ? { onBack: () => setCurrent(current - 1) } : {})}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {current === 0 ? (
        <StepTransition stepKey="email">
          <YStack gap="$4">
            <TextField
              label={t.common.email}
              value={email}
              onChangeText={setEmail}
              placeholder="prenom.nom@exemple.ch"
              keyboardType="email-address"
              autoComplete="email"
              error={fieldError}
              onSubmitEditing={goToPassword}
            />
            <PrimaryButton label={t.coach.next} onPress={goToPassword} />
            <GoogleAuthSection />
          </YStack>
        </StepTransition>
      ) : (
        <StepTransition stepKey="password">
          <YStack gap="$4">
            <YStack gap="$2">
              <TextField
                label={t.common.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                error={fieldError}
                onSubmitEditing={() => void submit()}
              />
              {fieldError ? null : (
                <Text fontSize={13} color="$brandChalkDim">
                  {fill(t.register.passwordHint, { min: String(PASSWORD_MIN_LENGTH) })}
                </Text>
              )}
            </YStack>
            <PrimaryButton label={t.register.submit} loading={busy} onPress={() => void submit()} />
          </YStack>
        </StepTransition>
      )}

      <XStack justifyContent="center" gap="$2">
        <Text fontSize={15} color="$brandChalkDim">
          {t.register.hasAccount}
        </Text>
        <Pressable onPress={() => router.replace('/login')} accessibilityRole="button">
          <Text fontSize={15} fontWeight="700" color="$brandPitchBright">
            {t.login.submit}
          </Text>
        </Pressable>
      </XStack>
    </AuthFormShell>
  );
}
