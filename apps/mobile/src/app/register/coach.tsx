import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { coachEntryStep, resendCoachInvite, verifyCoachCode } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { GoogleSignInError } from '@/auth/google-sign-in';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GoogleButton } from '@/ui/google-button';
import { PrimaryButton } from '@/ui/primary-button';
import { Stepper } from '@/ui/stepper';
import { TextField } from '@/ui/text-field';
import { useStepper } from '@/ui/use-stepper';
import { validateEmail, validatePassword } from '@/ui/validation';

/**
 * Entrée de l'entraîneur, en plusieurs étapes.
 *
 * On demande d'abord l'email, puis le serveur dit quoi faire ensuite : saisir
 * le code d'activation, saisir son mot de passe, ou passer par Google. C'est le
 * serveur qui décide, parce que lui seul sait où en est le compte — l'entraîneur
 * n'a pas à savoir s'il est « déjà activé ».
 *
 * Google court-circuite le code : il prouve exactement la même chose, la
 * maîtrise de la boîte mail. Le seul cas à traiter est celui d'une adresse
 * Google différente de celle enregistrée par le club.
 */
type Step = 'EMAIL' | 'CODE' | 'SET_PASSWORD' | 'PASSWORD' | 'GOOGLE_ONLY';

export default function RegisterCoach(): ReactNode {
  const router = useRouter();
  const { t, fill } = useI18n();
  const { acceptCoachInvite, signIn, signInWithGoogleAsCoach } = useAuth();
  const params = useLocalSearchParams<{ email?: string; code?: string }>();

  const [step, setStep] = useState<Step>('EMAIL');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState(params.code ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const [busy, setBusy] = useState(false);
  const autoStarted = useRef(false);
  // Dernier code déjà vérifié automatiquement : garde contre la re-soumission.
  const autoChecked = useRef<string>('');

  const fail = useCallback(
    (message: string) => {
      setTone('error');
      setBanner(message);
    },
    [],
  );

  // --- Étape 1 : l'email décide de la suite -------------------------------
  const submitEmail = useCallback(
    async (value: string): Promise<void> => {
      const invalid = validateEmail(value, t);
      setFieldError(invalid);
      setBanner(undefined);
      if (invalid) {
        return;
      }
      setBusy(true);
      try {
        const { step: next } = await coachEntryStep(value);
        if (next === 'CODE') {
          setStep('CODE');
        } else if (next === 'PASSWORD') {
          setStep('PASSWORD');
        } else if (next === 'GOOGLE') {
          setStep('GOOGLE_ONLY');
        } else {
          fail(t.coach.unknown);
        }
      } catch (error) {
        fail(toUserMessage(error, t));
      } finally {
        setBusy(false);
      }
    },
    [fail, t],
  );

  // Lien de l'email : on enchaîne directement sur la saisie du code.
  useEffect(() => {
    if (params.email && !autoStarted.current) {
      autoStarted.current = true;
      void submitEmail(params.email);
    }
  }, [params.email, submitEmail]);

  // --- Étape 2 : le code, vérifié sans être consommé ----------------------
  const submitCode = async (value: string = code): Promise<void> => {
    const invalid = /^\d{6}$/.test(value.trim()) ? undefined : t.errors.codeFormat;
    setFieldError(invalid);
    setBanner(undefined);
    if (invalid) {
      return;
    }
    setBusy(true);
    try {
      await verifyCoachCode(email, value);
      setStep('SET_PASSWORD');
    } catch (error) {
      fail(describeInviteError(error, t));
    } finally {
      setBusy(false);
    }
  };

  const resend = async (): Promise<void> => {
    setBusy(true);
    setBanner(undefined);
    try {
      await resendCoachInvite(email);
      setTone('success');
      setBanner(t.coach.resent);
    } catch (error) {
      fail(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  // --- Étape 3a : création du mot de passe (activation) -------------------
  const submitNewPassword = async (): Promise<void> => {
    const invalid = validatePassword(password, t);
    setFieldError(invalid);
    setBanner(undefined);
    if (invalid) {
      return;
    }
    if (password !== confirm) {
      fail(t.coach.mismatch);
      return;
    }
    setBusy(true);
    try {
      await acceptCoachInvite(email, code, password);
      router.replace('/');
    } catch (error) {
      fail(describeInviteError(error, t));
    } finally {
      setBusy(false);
    }
  };

  // --- Étape 3b : compte déjà activé, connexion normale -------------------
  const submitExistingPassword = async (): Promise<void> => {
    setBanner(undefined);
    if (password.length === 0) {
      setFieldError(t.errors.required);
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (error) {
      fail(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Google : raccourci, mais l'adresse doit être celle que le club a saisie.
   *
   * C'est le SERVEUR qui tranche, via un endpoint dédié : il exige une
   * invitation avant de créer la moindre session. L'app se contentait avant de
   * se connecter puis d'interroger `/clubs/me` — ce qui laissait derrière elle
   * un compte joueur vide pour chaque adresse non invitée, et n'affichait le
   * refus qu'après trois allers-retours réseau.
   */
  const withGoogle = async (): Promise<void> => {
    setBanner(undefined);
    setBusy(true);
    try {
      await signInWithGoogleAsCoach();
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'COACH_NOT_INVITED') {
        fail(t.coach.googleNotInvited);
        return;
      }
      if (error instanceof GoogleSignInError) {
        if (error.reason === 'CANCELLED') {
          return;
        }
        fail(
          error.reason === 'NEEDS_DEV_BUILD'
            ? t.google.needsDevBuild
            : error.reason === 'NOT_CONFIGURED'
              ? t.google.notConfigured
              : t.google.failed,
        );
        return;
      }
      fail(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const backToEmail = (): void => {
    setStep('EMAIL');
    setCode('');
    setPassword('');
    setConfirm('');
    setFieldError(undefined);
    setBanner(undefined);
  };

  const { title, subtitle } = headings(step, t, fill, email);

  // Le nombre d'étapes dépend de l'état du compte, que seul le serveur connaît :
  // activer une invitation en fait trois, se reconnecter n'en fait que deux.
  // Tant qu'on ne sait pas, on annonce le parcours d'activation, qui est celui
  // de tout entraîneur arrivant pour la première fois.
  const labels =
    step === 'PASSWORD'
      ? [t.steps.email, t.steps.password]
      : [t.steps.email, t.steps.code, t.steps.password];
  const current = { EMAIL: 0, CODE: 1, SET_PASSWORD: 2, PASSWORD: 1, GOOGLE_ONLY: 1 }[step];
  const { stepLabel, nextLabel } = useStepper(labels, current);

  return (
    <AuthFormShell
      title={title}
      subtitle={subtitle}
      header={
        step === 'GOOGLE_ONLY' ? undefined : (
          <Stepper steps={labels} current={current} stepLabel={stepLabel} nextLabel={nextLabel} />
        )
      }
      {...(step === 'SET_PASSWORD' ? { onBack: () => setStep('CODE') } : {})}
    >
      {banner ? <FormBanner message={banner} tone={tone} /> : null}

      {step === 'EMAIL' ? (
        <>
          <TextField
            label={t.common.email}
            value={email}
            onChangeText={setEmail}
            placeholder="prenom.nom@exemple.ch"
            keyboardType="email-address"
            autoComplete="email"
            error={fieldError}
            onSubmitEditing={() => void submitEmail(email)}
          />
          <PrimaryButton
            label={t.coach.next}
            loading={busy}
            onPress={() => void submitEmail(email)}
          />
          <GoogleButton label={t.google.signIn} disabled={busy} onPress={() => void withGoogle()} />
        </>
      ) : null}

      {step === 'CODE' ? (
        <>
          <TextField
            label={t.coach.codeLabel}
            value={code}
            onChangeText={(value) => {
              const next = value.replace(/\D/g, '').slice(0, 6);
              setCode(next);
              // Vérification automatique dès les 6 chiffres. Le ref évite de
              // retirer sur un code déjà refusé ou en cours de vérification.
              if (next.length === 6 && next !== autoChecked.current && !busy) {
                autoChecked.current = next;
                void submitCode(next);
              }
            }}
            placeholder="000000"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            error={fieldError}
            onSubmitEditing={() => void submitCode()}
          />
          <PrimaryButton label={t.coach.next} loading={busy} onPress={() => void submitCode()} />
          <PrimaryButton
            label={t.coach.resend}
            variant="ghost"
            disabled={busy}
            onPress={() => void resend()}
          />
        </>
      ) : null}

      {step === 'SET_PASSWORD' ? (
        <>
          <YStack gap="$2">
            <TextField
              label={t.common.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              error={fieldError}
            />
            <Text fontSize={13} color="$brandChalkDim">
              {t.register.passwordHint}
            </Text>
          </YStack>
          <TextField
            label={t.coach.confirmLabel}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={() => void submitNewPassword()}
          />
          <PrimaryButton
            label={t.coach.submit}
            loading={busy}
            onPress={() => void submitNewPassword()}
          />
        </>
      ) : null}

      {step === 'PASSWORD' ? (
        <>
          <TextField
            label={t.common.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            error={fieldError}
            onSubmitEditing={() => void submitExistingPassword()}
          />
          <PrimaryButton
            label={t.login.submit}
            loading={busy}
            onPress={() => void submitExistingPassword()}
          />
        </>
      ) : null}

      {step === 'GOOGLE_ONLY' ? (
        <GoogleButton label={t.google.signIn} loading={busy} onPress={() => void withGoogle()} />
      ) : null}

      {step !== 'EMAIL' ? (
        <XStack justifyContent="center">
          <Pressable onPress={backToEmail} accessibilityRole="button">
            <Text fontSize={15} color="$brandChalkDim">
              {t.coach.changeEmail}
            </Text>
          </Pressable>
        </XStack>
      ) : null}
    </AuthFormShell>
  );
}

/** Un code brûlé demande une action du club, pas une nouvelle tentative. */
function describeInviteError(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (error instanceof ApiError && error.code === 'COACH_INVITE_LOCKED') {
    return t.errors.inviteLocked;
  }
  if (error instanceof ApiError && error.code === 'COACH_INVITE_INVALID') {
    return t.errors.inviteInvalid;
  }
  return toUserMessage(error, t);
}

function headings(
  step: Step,
  t: ReturnType<typeof useI18n>['t'],
  fill: ReturnType<typeof useI18n>['fill'],
  email: string,
): { title: string; subtitle: string } {
  switch (step) {
    case 'CODE':
      return {
        title: t.coach.codeTitle,
        subtitle: fill(t.coach.codeSubtitle, { email }),
      };
    case 'SET_PASSWORD':
      return { title: t.coach.setPasswordTitle, subtitle: t.coach.setPasswordSubtitle };
    case 'PASSWORD':
      return { title: t.coach.passwordTitle, subtitle: t.coach.passwordSubtitle };
    case 'GOOGLE_ONLY':
      return { title: t.coach.googleOnlyTitle, subtitle: t.coach.googleOnlySubtitle };
    default:
      return { title: t.coach.title, subtitle: t.coach.subtitle };
  }
}
