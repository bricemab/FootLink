import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validatePassword } from '@/ui/validation';

/**
 * Cible du lien d'invitation entraîneur.
 *
 * Le club a créé le compte sans mot de passe ; l'invité le pose ici. Consommer
 * le jeton prouve l'accès à la boîte mail, donc le serveur valide l'email dans
 * la foulée : pas d'écran de confirmation supplémentaire derrière.
 */
export default function CoachInvite(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const { acceptCoachInvite } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const token = params.token ?? '';

  const submit = async (): Promise<void> => {
    if (token.length === 0) {
      setBanner(t.coachInvite.missingToken);
      return;
    }
    const invalid = validatePassword(password, t);
    setPasswordError(invalid);
    setBanner(undefined);
    if (invalid) {
      return;
    }
    setBusy(true);
    try {
      await acceptCoachInvite(token, password);
      router.replace('/');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFormShell title={t.coachInvite.title} subtitle={t.coachInvite.subtitle}>
      {banner ? <FormBanner message={banner} /> : null}
      {token.length === 0 && !banner ? <FormBanner message={t.coachInvite.missingToken} /> : null}

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

      <PrimaryButton
        label={t.coachInvite.submit}
        loading={busy}
        disabled={token.length === 0}
        onPress={() => void submit()}
      />
    </AuthFormShell>
  );
}
