import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Separator, Text, XStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';
import { GoogleSignInError } from '@/auth/google-sign-in';
import { useI18n } from '@/i18n';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GoogleButton } from '@/ui/google-button';

/**
 * Bloc « ou continuer avec Google », partagé par la connexion et l'inscription.
 *
 * Côté Google il n'y a pas de distinction entre les deux : le serveur crée le
 * compte s'il n'existe pas, et rattache l'identité Google à un compte existant
 * de même email. Un seul composant suffit donc pour les deux écrans.
 */
export function GoogleAuthSection(): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const { signInWithGoogle } = useAuth();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const start = async (): Promise<void> => {
    setBanner(undefined);
    setBusy(true);
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (error) {
      if (error instanceof GoogleSignInError) {
        // Annulation volontaire : rien à signaler, l'utilisateur sait ce qu'il a fait.
        if (error.reason === 'CANCELLED') {
          return;
        }
        if (error.reason === 'NEEDS_DEV_BUILD') {
          setBanner(t.google.needsDevBuild);
        } else if (error.reason === 'NOT_CONFIGURED') {
          setBanner(t.google.notConfigured);
        } else {
          setBanner(t.google.failed);
        }
        return;
      }
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <XStack alignItems="center" gap="$3">
        <Separator flex={1} borderColor="rgba(244,251,247,0.18)" />
        <Text fontSize={13} color="$brandChalkDim">
          {t.google.separator}
        </Text>
        <Separator flex={1} borderColor="rgba(244,251,247,0.18)" />
      </XStack>

      {banner ? <FormBanner message={banner} /> : null}

      <GoogleButton label={t.google.signIn} loading={busy} onPress={() => void start()} />
    </>
  );
}
