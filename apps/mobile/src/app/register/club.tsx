import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { requestSignupCode, verifySignupCode } from '@/api/auth';
import { listRegions, requestClub, type Region } from '@/api/clubs';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { GoogleSignInError } from '@/auth/google-sign-in';
import { loadTokens } from '@/auth/token-storage';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GoogleButton } from '@/ui/google-button';
import { PrimaryButton } from '@/ui/primary-button';
import { RegionPicker } from '@/ui/region-picker';
import { Stepper, StepTransition } from '@/ui/stepper';
import { TextField } from '@/ui/text-field';
import { useStepper } from '@/ui/use-stepper';
import { validateEmail, validatePassword } from '@/ui/validation';

/**
 * Demande de compte club.
 *
 * On commence par savoir QUI parle : Google, ou email confirmé par un code à
 * 6 chiffres. Demander le nom du club avant d'avoir prouvé l'identité du
 * demandeur reviendrait à créer des clubs au nom de n'importe qui — et le
 * serveur refuse d'ailleurs désormais une demande non authentifiée.
 *
 * Google fait sauter l'étape du code : il prouve exactement la même chose, la
 * maîtrise de la boîte mail.
 */
type Step = 'ACCOUNT' | 'CODE' | 'PASSWORD' | 'CLUB' | 'CONTEXT';

export default function RegisterClub(): ReactNode {
  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { signInWithGoogle, adoptSession, phase } = useAuth();

  const [step, setStep] = useState<Step>('ACCOUNT');
  const [openRegions, setOpenRegions] = useState<Region[]>([]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [clubName, setClubName] = useState('');
  const [locality, setLocality] = useState('');
  const [regionCode, setRegionCode] = useState<string>();
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Déjà connecté en arrivant ici : inutile de redemander une identité.
  useEffect(() => {
    if (phase === 'signedIn' && step === 'ACCOUNT') {
      setStep('CLUB');
    }
    // Volontairement au montage : on ne veut pas ramener l'utilisateur en
    // arrière si la session se rafraîchit pendant qu'il remplit le formulaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listRegions()
      .then((list) => {
        if (cancelled) {
          return;
        }
        // `active` est piloté en base : ouvrir un canton ne touche pas à l'app.
        const active = list.filter((region) => region.active);
        setOpenRegions(active);
        if (active.length === 1) {
          setRegionCode(active[0].code);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const fail = (message: string): void => setBanner(message);

  // --- Étape 1a : Google ---------------------------------------------------
  const withGoogle = async (): Promise<void> => {
    setBanner(undefined);
    setBusy(true);
    try {
      await signInWithGoogle();
      setStep('CLUB');
    } catch (error) {
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

  // --- Étape 1b : email -> code -------------------------------------------
  const sendCode = async (): Promise<void> => {
    const invalid = validateEmail(email, t);
    setFieldError(invalid);
    setBanner(undefined);
    if (invalid) {
      return;
    }
    setBusy(true);
    try {
      await requestSignupCode(email, locale);
      setFieldError(undefined);
      setStep('CODE');
    } catch (error) {
      fail(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async (): Promise<void> => {
    setBusy(true);
    setBanner(undefined);
    try {
      await requestSignupCode(email, locale);
      setBanner(t.coach.resent);
    } catch (error) {
      fail(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const goToPassword = (): void => {
    const invalid = /^\d{6}$/.test(code.trim()) ? undefined : t.errors.codeFormat;
    setFieldError(invalid);
    setBanner(undefined);
    if (!invalid) {
      setStep('PASSWORD');
    }
  };

  // --- Étape 1c : mot de passe (consomme le code) --------------------------
  const createAccount = async (): Promise<void> => {
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
      await adoptSession(await verifySignupCode(email, code, password));
      setStep('CLUB');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SIGNUP_CODE_LOCKED') {
        fail(t.errors.inviteLocked);
        setStep('CODE');
      } else if (error instanceof ApiError && error.code === 'SIGNUP_CODE_INVALID') {
        fail(t.errors.inviteInvalid);
        setStep('CODE');
      } else {
        fail(toUserMessage(error, t));
      }
    } finally {
      setBusy(false);
    }
  };

  // --- Étapes 2 et 3 : le club --------------------------------------------
  const goToContext = (): void => {
    const invalid = clubName.trim().length === 0 ? t.errors.required : undefined;
    setFieldError(invalid);
    setBanner(undefined);
    if (!invalid) {
      setStep('CONTEXT');
    }
  };

  const submit = async (): Promise<void> => {
    setBanner(undefined);
    setBusy(true);
    try {
      const tokens = await loadTokens();
      if (!tokens) {
        fail(t.errors.unknown);
        return;
      }
      await requestClub(tokens.accessToken, {
        clubName: clubName.trim(),
        ...(regionCode ? { regionCode } : {}),
        ...(locality.trim() ? { locality: locality.trim() } : {}),
        ...(note.trim() ? { requestNote: note.trim() } : {}),
      });
      router.replace('/');
    } catch (error) {
      fail(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  // Le parcours par email compte deux étapes de plus (code, mot de passe) que
  // le parcours Google. Le stepper reflète le chemin réellement emprunté.
  const viaEmail = step === 'CODE' || step === 'PASSWORD';
  const labels = viaEmail
    ? [t.steps.account, t.steps.code, t.steps.password, t.steps.clubIdentity, t.steps.clubContext]
    : [t.steps.account, t.steps.clubIdentity, t.steps.clubContext];
  const current = viaEmail
    ? { CODE: 1, PASSWORD: 2 }[step]
    : { ACCOUNT: 0, CLUB: 1, CONTEXT: 2 }[step as 'ACCOUNT' | 'CLUB' | 'CONTEXT'];
  const { stepLabel, nextLabel } = useStepper(labels, current);
  const { title, subtitle } = headings(step, t, fill, email);

  const back: Record<Step, Step | undefined> = {
    ACCOUNT: undefined,
    CODE: 'ACCOUNT',
    PASSWORD: 'CODE',
    CLUB: undefined,
    CONTEXT: 'CLUB',
  };

  return (
    <AuthFormShell
      title={title}
      subtitle={subtitle}
      header={
        <Stepper steps={labels} current={current} stepLabel={stepLabel} nextLabel={nextLabel} />
      }
      {...(back[step] ? { onBack: () => setStep(back[step] as Step) } : {})}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {step === 'ACCOUNT' ? (
        <StepTransition stepKey="account">
          <YStack gap="$4">
            <TextField
              label={t.common.email}
              value={email}
              onChangeText={setEmail}
              placeholder="contact@fcsion.ch"
              keyboardType="email-address"
              autoComplete="email"
              error={fieldError}
              onSubmitEditing={() => void sendCode()}
            />
            <PrimaryButton label={t.coach.next} loading={busy} onPress={() => void sendCode()} />
            <GoogleButton
              label={t.google.signIn}
              disabled={busy}
              onPress={() => void withGoogle()}
            />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'CODE' ? (
        <StepTransition stepKey="code">
          <YStack gap="$4">
            <TextField
              label={t.coach.codeLabel}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              error={fieldError}
              onSubmitEditing={goToPassword}
            />
            <PrimaryButton label={t.coach.next} onPress={goToPassword} />
            <PrimaryButton
              label={t.coach.resend}
              variant="ghost"
              disabled={busy}
              onPress={() => void resendCode()}
            />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'PASSWORD' ? (
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
              />
              {fieldError ? null : (
                <Text fontSize={13} color="$brandChalkDim">
                  {t.register.passwordHint}
                </Text>
              )}
            </YStack>
            <TextField
              label={t.coach.confirmLabel}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              onSubmitEditing={() => void createAccount()}
            />
            <PrimaryButton
              label={t.coach.next}
              loading={busy}
              onPress={() => void createAccount()}
            />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'CLUB' ? (
        <StepTransition stepKey="club">
          <YStack gap="$4">
            <TextField
              label={t.club.clubName}
              value={clubName}
              onChangeText={setClubName}
              placeholder="FC Sion"
              autoCapitalize="words"
              error={fieldError}
            />
            <RegionPicker regions={openRegions} value={regionCode} onChange={setRegionCode} />
            <TextField
              label={t.club.locality}
              value={locality}
              onChangeText={setLocality}
              placeholder="Sion"
              autoCapitalize="words"
            />
            <PrimaryButton label={t.coach.next} onPress={goToContext} />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'CONTEXT' ? (
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

function headings(
  step: Step,
  t: ReturnType<typeof useI18n>['t'],
  fill: ReturnType<typeof useI18n>['fill'],
  email: string,
): { title: string; subtitle: string } {
  switch (step) {
    case 'ACCOUNT':
      return { title: t.club.accountTitle, subtitle: t.club.accountSubtitle };
    case 'CODE':
      return { title: t.club.codeTitle, subtitle: fill(t.club.codeSubtitle, { email }) };
    case 'PASSWORD':
      return { title: t.club.passwordTitle, subtitle: t.club.passwordSubtitle };
    default:
      return { title: t.club.title, subtitle: t.club.subtitle };
  }
}
