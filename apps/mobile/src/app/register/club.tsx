import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { requestSignupCode, verifySignupCode } from '@/api/auth';
import { getMyClub, listRegions, requestClub, type Region } from '@/api/clubs';
import type { ResolvedPlace } from '@/api/geo';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { GoogleSignInError } from '@/auth/google-sign-in';
import { loadTokens } from '@/auth/token-storage';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GoogleButton } from '@/ui/google-button';
import { PlacePicker } from '@/ui/place-picker';
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
  const [pitch, setPitch] = useState<ResolvedPlace>();
  // Repli quand la recherche d'adresse est HS : mieux vaut une localité saisie à
  // la main qu'une inscription bloquée par la panne d'un service tiers.
  const [placesDown, setPlacesDown] = useState(false);
  const [locality, setLocality] = useState('');
  const [regionCode, setRegionCode] = useState<string>();
  const [accessToken, setAccessToken] = useState<string>();
  const [alreadyHasClub, setAlreadyHasClub] = useState(false);
  const [website, setWebsite] = useState('');
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

  /**
   * Une fois l'identité établie, deux choses avant d'afficher le formulaire.
   *
   * 1. Récupérer le jeton : l'autocomplétion du terrain est authentifiée, et
   *    l'obtenir maintenant évite une latence au premier caractère tapé.
   * 2. Vérifier que ce compte n'a pas DÉJÀ un club. Se connecter avec un compte
   *    existant — par Google surtout, qui ne distingue pas « s'inscrire » de
   *    « se connecter » — amenait droit au formulaire, et l'échec ne tombait
   *    qu'à l'envoi, après avoir tout ressaisi.
   */
  useEffect(() => {
    if (step !== 'CLUB' || accessToken) {
      return;
    }
    let cancelled = false;
    void loadTokens().then(async (tokens) => {
      if (cancelled || !tokens) {
        return;
      }
      setAccessToken(tokens.accessToken);
      const existing = await getMyClub(tokens.accessToken).catch(() => null);
      if (!cancelled && existing) {
        setAlreadyHasClub(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, accessToken]);

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
  // Le terrain est ce qui donne au club sa position, son canton et son
  // association : sans lui, le club n'apparaîtrait dans aucune recherche par
  // rayon. On l'exige donc, sauf si la recherche d'adresse est en panne — dans
  // ce cas la localité saisie à la main suffit à ne pas bloquer l'inscription.
  const [pitchError, setPitchError] = useState<string>();

  const goToContext = (): void => {
    const nameInvalid = clubName.trim().length === 0 ? t.errors.required : undefined;
    const locationMissing = !pitch && !(placesDown && locality.trim().length > 0);
    setFieldError(nameInvalid);
    setPitchError(locationMissing ? t.club.pitchRequired : undefined);
    setBanner(undefined);
    if (!nameInvalid && !locationMissing) {
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
        // On envoie le point brut ; canton, commune et association sont
        // recalculés par le serveur à partir de lui.
        ...(pitch
          ? { lat: pitch.lat, lng: pitch.lng, stadiumName: pitch.label, addressLine: pitch.label }
          : {}),
        ...(!pitch && locality.trim() ? { locality: locality.trim() } : {}),
        ...(website.trim() ? { websiteUrl: website.trim() } : {}),
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
            {/* Un compte déjà utilisable sur cette adresse fait échouer l'envoi
                du code (409) : le lien donne l'issue au lieu de laisser
                l'utilisateur buter sur le message. */}
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

      {step === 'CLUB' && alreadyHasClub ? (
        // Impasse annoncée tout de suite, plutôt qu'un formulaire à remplir
        // pour rien : ce compte a déjà un club, l'API refuserait à l'envoi.
        <StepTransition stepKey="already">
          <YStack gap="$4">
            <FormBanner message={t.errors.clubAlreadyLinked} />
            <PrimaryButton label={t.club.goHome} onPress={() => router.replace('/')} />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'CLUB' && !alreadyHasClub ? (
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
            {accessToken ? (
              <PlacePicker
                accessToken={accessToken}
                value={pitch}
                onChange={(place) => {
                  setPitch(place);
                  setPitchError(undefined);
                  // Le terrain donne le canton, qui donne l'association : la
                  // redemander juste après serait absurde. On ne présélectionne
                  // que si elle est réellement ouverte — sinon on poserait une
                  // valeur absente de la liste, donc invisible et incorrigeable.
                  if (place?.regionCode && openRegions.some((r) => r.code === place.regionCode)) {
                    setRegionCode(place.regionCode);
                  }
                }}
                error={pitchError}
                onUnavailable={setPlacesDown}
              />
            ) : null}
            {/* Sans recherche d'adresse, on retombe sur une localité libre : le
                club sera positionné plus tard, mais l'inscription passe. */}
            {placesDown && !pitch ? (
              <TextField
                label={t.club.locality}
                value={locality}
                onChangeText={setLocality}
                placeholder="Sion"
                autoCapitalize="words"
              />
            ) : null}
            <RegionPicker regions={openRegions} value={regionCode} onChange={setRegionCode} />
            <PrimaryButton label={t.coach.next} onPress={goToContext} />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'CONTEXT' ? (
        <StepTransition stepKey="context">
          <YStack gap="$4">
            {/* Le site aide surtout le SUPER_ADMIN à valider la demande : il
                lui suffit d'y retrouver le nom du demandeur. D'où sa place
                ici, à côté du mot de contexte, et non dans l'identité. */}
            <TextField
              label={t.club.website}
              value={website}
              onChangeText={setWebsite}
              placeholder={t.club.websitePlaceholder}
              keyboardType="url"
              autoCapitalize="none"
            />
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
