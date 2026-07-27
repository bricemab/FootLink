import { useRouter, type Href } from 'expo-router';
import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useSignedInRedirect } from '@/auth/signed-in-guard';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { BallIcon, ChevronIcon, CoachIcon, StadiumIcon } from '@/ui/icons';

/**
 * Choix du rôle à l'inscription.
 *
 * Les trois parcours n'ont rien à voir : le joueur s'inscrit librement, le club
 * dépose une demande à valider, et l'entraîneur ne s'inscrit pas vraiment — son
 * compte existe déjà, créé par son club, il ne fait que l'activer.
 */
export default function ChooseRole(): ReactNode {
  // Deja connecte : cet ecran n'a plus d'objet. Voir `useSignedInRedirect`.
  const signedIn = useSignedInRedirect();
  if (signedIn) {
    return signedIn;
  }

  const router = useRouter();
  const { t } = useI18n();

  const roles = [
    { href: '/register/player', label: t.roles.player, hint: t.roles.playerHint, Icon: BallIcon },
    { href: '/register/coach', label: t.roles.coach, hint: t.roles.coachHint, Icon: CoachIcon },
    { href: '/register/club', label: t.roles.club, hint: t.roles.clubHint, Icon: StadiumIcon },
  ] as const;

  return (
    <AuthFormShell title={t.roles.title} subtitle={t.roles.subtitle}>
      <YStack gap="$3">
        {/* Pas d'animation d'entrée en cascade : ses valeurs de départ
            persistent quand elle ne se joue pas (cf. `StepTransition`). Le
            retour au toucher, lui, est déclenché par l'utilisateur et reste
            animé — il part toujours de l'état courant, donc rien ne peut y
            rester figé. */}
        {roles.map((role) => (
          <YStack key={role.href}>
            <Pressable
              onPress={() => router.push(role.href as Href)}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <MotiView
                  animate={{ scale: pressed ? 0.975 : 1 }}
                  transition={{ type: 'timing', duration: 110 }}
                >
                  <XStack
                    alignItems="center"
                    gap="$3.5"
                    padding="$4"
                    borderRadius={20}
                    backgroundColor="rgba(14,36,28,0.75)"
                    borderWidth={1.5}
                    borderColor={pressed ? '#39FF88' : 'rgba(244,251,247,0.14)'}
                  >
                    <role.Icon />
                    <YStack flex={1} gap="$1">
                      <Text fontSize={17} fontWeight="700" color="$brandChalk">
                        {role.label}
                      </Text>
                      <Text fontSize={14} lineHeight={19} color="$brandChalkDim">
                        {role.hint}
                      </Text>
                    </YStack>
                    <ChevronIcon direction="right" />
                  </XStack>
                </MotiView>
              )}
            </Pressable>
          </YStack>
        ))}
      </YStack>

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
