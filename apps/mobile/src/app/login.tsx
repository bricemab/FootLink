import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail } from '@/ui/validation';

export default function Login(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const invalidEmail = validateEmail(email, t);
    setEmailError(invalidEmail);
    setBanner(undefined);
    if (invalidEmail || password.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      // La garde de `index.tsx` décide de la suite (validation email ou accueil).
      router.replace('/');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFormShell title={t.login.title} subtitle={t.login.subtitle}>
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
        label={t.common.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={() => void submit()}
      />

      <PrimaryButton label={t.login.submit} loading={busy} onPress={() => void submit()} />

      <XStack justifyContent="center" gap="$2">
        <Text fontSize={15} color="$brandChalkDim">
          {t.login.noAccount}
        </Text>
        <Pressable onPress={() => router.replace('/register')} accessibilityRole="button">
          <Text fontSize={15} fontWeight="700" color="$brandPitchBright">
            {t.welcome.signUp}
          </Text>
        </Pressable>
      </XStack>
    </AuthFormShell>
  );
}
