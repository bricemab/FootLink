import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';

/**
 * Écran de validation d'email.
 *
 * Deux chemins mènent ici : la garde de routage (compte non validé) et le lien
 * profond de l'email — `footlink://auth/verify-email?token=…` — d'où le
 * `token` en paramètre, consommé automatiquement.
 */
export default function VerifyEmail(): ReactNode {
  const router = useRouter();
  const { t, fill } = useI18n();
  const { user, verifyEmail, resendVerification, signOut } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();

  const [code, setCode] = useState(params.token ?? '');
  const [banner, setBanner] = useState<string>();
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const [busy, setBusy] = useState(false);
  const autoSubmitted = useRef(false);

  const submit = useCallback(
    async (value: string): Promise<void> => {
      if (value.trim().length === 0) {
        setTone('error');
        setBanner(t.errors.required);
        return;
      }
      setBusy(true);
      setBanner(undefined);
      try {
        await verifyEmail(value);
        setTone('success');
        setBanner(t.verify.done);
        router.replace('/');
      } catch (error) {
        setTone('error');
        setBanner(toUserMessage(error, t));
      } finally {
        setBusy(false);
      }
    },
    [router, t, verifyEmail],
  );

  // Lien profond : on valide sans faire retaper le code.
  useEffect(() => {
    if (params.token && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submit(params.token);
    }
  }, [params.token, submit]);

  const resend = async (): Promise<void> => {
    setBusy(true);
    setBanner(undefined);
    try {
      await resendVerification();
      setTone('success');
      setBanner(t.verify.resent);
    } catch (error) {
      setTone('error');
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFormShell
      title={t.verify.title}
      subtitle={fill(t.verify.subtitle, { email: user?.email ?? '' })}
    >
      {banner ? <FormBanner message={banner} tone={tone} /> : null}

      <TextField
        label={t.verify.codeLabel}
        value={code}
        onChangeText={setCode}
        placeholder="xxxxxxxx.xxxxxxxx"
        onSubmitEditing={() => void submit(code)}
      />

      <PrimaryButton label={t.verify.submit} loading={busy} onPress={() => void submit(code)} />
      <PrimaryButton
        label={t.verify.resend}
        variant="ghost"
        disabled={busy}
        onPress={() => void resend()}
      />

      <XStack justifyContent="center">
        <Pressable
          onPress={() => {
            void signOut().then(() => router.replace('/'));
          }}
          accessibilityRole="button"
        >
          <Text fontSize={15} color="$brandChalkDim">
            {t.common.logout}
          </Text>
        </Pressable>
      </XStack>
    </AuthFormShell>
  );
}
