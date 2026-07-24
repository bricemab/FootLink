import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { listRegions, requestClub, type Region } from '@/api/clubs';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';
import { TextField } from '@/ui/text-field';
import { validateEmail, validatePassword } from '@/ui/validation';

/**
 * Demande de compte club.
 *
 * Ce n'est pas une inscription ordinaire : le club est créé en attente, et
 * seul un SUPER_ADMIN peut le débloquer. C'est ce qui garantit qu'aucun faux
 * club ne publie d'annonce.
 */
export default function RegisterClub(): ReactNode {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { adoptSession } = useAuth();

  const [regions, setRegions] = useState<Region[]>([]);
  const [clubName, setClubName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [locality, setLocality] = useState('');
  const [note, setNote] = useState('');
  const [regionCode, setRegionCode] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listRegions()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setRegions(list);
        // Une seule association est active au MVP (AVF) : autant la présélectionner.
        const active = list.filter((region) => region.active);
        if (active.length === 1) {
          setRegionCode(active[0].code);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (): Promise<void> => {
    const nextErrors = {
      clubName: clubName.trim().length === 0 ? t.errors.required : undefined,
      email: validateEmail(email, t),
      password: validatePassword(password, t),
    };
    setErrors(nextErrors);
    setBanner(undefined);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setBusy(true);
    try {
      const result = await requestClub({
        clubName: clubName.trim(),
        email,
        password,
        locale,
        ...(regionCode ? { regionCode } : {}),
        ...(locality.trim() ? { locality: locality.trim() } : {}),
        ...(note.trim() ? { requestNote: note.trim() } : {}),
      });
      // La demande ouvre déjà une session : l'email reste à valider, la garde
      // de routage enverra donc sur l'écran de confirmation.
      await adoptSession(result.tokens);
      router.replace('/');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const label = (region: Region): string => (locale === 'DE' ? region.labelDe : region.labelFr);

  return (
    <AuthFormShell title={t.club.title} subtitle={t.club.subtitle}>
      {banner ? <FormBanner message={banner} /> : null}

      <TextField
        label={t.club.clubName}
        value={clubName}
        onChangeText={setClubName}
        placeholder="FC Sion"
        autoCapitalize="words"
        error={errors.clubName}
      />
      <TextField
        label={t.common.email}
        value={email}
        onChangeText={setEmail}
        placeholder="contact@fcsion.ch"
        keyboardType="email-address"
        autoComplete="email"
        error={errors.email}
      />
      <TextField
        label={t.common.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        error={errors.password}
      />

      {regions.length > 0 ? (
        <YStack gap="$2">
          <Text fontSize={13} fontWeight="600" color="$brandChalkDim" letterSpacing={0.4}>
            {t.club.region.toUpperCase()}
          </Text>
          <XStack flexWrap="wrap" gap="$2">
            {regions
              .filter((region) => region.active)
              .map((region) => (
                <Pressable
                  key={region.code}
                  onPress={() => setRegionCode(region.code)}
                  accessibilityRole="button"
                >
                  <XStack
                    paddingVertical="$2.5"
                    paddingHorizontal="$3.5"
                    borderRadius={14}
                    borderWidth={1.5}
                    borderColor={regionCode === region.code ? '#39FF88' : 'rgba(244,251,247,0.18)'}
                    backgroundColor="rgba(14,36,28,0.7)"
                  >
                    <Text fontSize={14} color="$brandChalk">
                      {label(region)}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
          </XStack>
        </YStack>
      ) : null}

      <TextField label={t.club.locality} value={locality} onChangeText={setLocality} placeholder="Sion" autoCapitalize="words" />
      <TextField
        label={t.club.note}
        value={note}
        onChangeText={setNote}
        placeholder={t.club.notePlaceholder}
        autoCapitalize="sentences"
      />

      <PrimaryButton label={t.club.submit} loading={busy} onPress={() => void submit()} />
    </AuthFormShell>
  );
}
