import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail, validatePassword } from '@/ui/validation';

export default function Register(): ReactNode {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const invalidEmail = validateEmail(email, t);
    const invalidPassword = validatePassword(password, t);
    setEmailError(invalidEmail);
    setPasswordError(invalidPassword);
    setBanner(undefined);
    if (invalidEmail || invalidPassword) {
      return;
    }
    setBusy(true);
    try {
      await signUp(email, password, locale);
      // Le compte existe mais l'email n'est pas validé : la garde enverra
      // directement sur l'écran de confirmation.
      router.replace('/');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFormShell title={t.register.title} subtitle={t.register.subtitle}>
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

      <PrimaryButton label={t.register.submit} loading={busy} onPress={() => void submit()} />

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
