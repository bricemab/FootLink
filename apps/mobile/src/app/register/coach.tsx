import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail, validatePassword } from '@/ui/validation';

/**
 * Activation d'un compte entraîneur.
 *
 * L'entraîneur ne s'inscrit pas : son compte a été créé par son club, avec
 * l'adresse email que le club a saisie. Recopier le code reçu à cette adresse
 * prouve qu'il y a accès — le compte est activé et l'email validé d'un coup.
 *
 * Deux chemins mènent ici : le choix « Je suis entraîneur » à l'inscription, et
 * le lien de l'email, qui pré-remplit email et code.
 */
export default function RegisterCoach(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const { acceptCoachInvite } = useAuth();
  const params = useLocalSearchParams<{ email?: string; code?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState(params.code ?? '');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const invalidEmail = validateEmail(email, t);
    const invalidCode = /^\d{6}$/.test(code.trim()) ? undefined : t.errors.codeFormat;
    const invalidPassword = validatePassword(password, t);
    setEmailError(invalidEmail);
    setCodeError(invalidCode);
    setPasswordError(invalidPassword);
    setBanner(undefined);
    if (invalidEmail || invalidCode || invalidPassword) {
      return;
    }

    setBusy(true);
    try {
      await acceptCoachInvite(email, code, password);
      router.replace('/');
    } catch (error) {
      // L'API distingue « code faux » de « code brûlé après trop d'essais » :
      // la deuxième situation demande une action du club, pas une nouvelle
      // tentative, donc elle mérite son propre message.
      if (error instanceof ApiError && error.code === 'COACH_INVITE_LOCKED') {
        setBanner(t.errors.inviteLocked);
      } else if (error instanceof ApiError && error.code === 'COACH_INVITE_INVALID') {
        setBanner(t.errors.inviteInvalid);
      } else {
        setBanner(toUserMessage(error, t));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFormShell title={t.coach.title} subtitle={t.coach.subtitle}>
      {banner ? <FormBanner message={banner} /> : null}

      <TextField
        label={t.common.email}
        value={email}
        onChangeText={setEmail}
        placeholder="prenom.nom@exemple.ch"
        keyboardType="email-address"
        autoComplete="email"
        error={emailError}
      />
      <TextField
        label={t.coach.codeLabel}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        error={codeError}
      />
      <YStack gap="$2">
        <TextField
          label={t.common.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          error={passwordError}
          onSubmitEditing={() => void submit()}
        />
        {passwordError ? null : (
          <Text fontSize={13} color="$brandChalkDim">
            {t.register.passwordHint}
          </Text>
        )}
      </YStack>

      <PrimaryButton label={t.coach.submit} loading={busy} onPress={() => void submit()} />
    </AuthFormShell>
  );
}
