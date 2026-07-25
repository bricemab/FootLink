import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { PitchBackdrop } from '@/ui/pitch-backdrop';

/**
 * Enveloppe commune aux écrans d'authentification : titre, retour, et gestion
 * du clavier (sinon le bouton d'envoi passe sous le clavier iOS).
 *
 * ⚠️ **Aucune animation d'entrée ici**, et ce n'est pas un oubli. Sur ce stack,
 * une animation d'entrée ne se joue pas toujours, et ses valeurs de départ
 * persistent : `opacity: 0` laissait le titre et tout le formulaire invisibles
 * (« écran vide »), `translateY` les laissait décalés. Toute valeur de départ
 * différente de l'arrivée peut rester à l'écran — voir le commentaire de
 * `StepTransition` pour le détail.
 */
export function AuthFormShell({
  title,
  subtitle,
  header,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  /** Zone au-dessus du titre : sert au stepper des inscriptions en étapes. */
  header?: ReactNode;
  /** Remplace le retour de navigation, pour revenir à l'étape précédente. */
  onBack?: () => void;
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <PitchBackdrop>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$5">
            {onBack ?? router.canGoBack() ? (
              <Pressable
                onPress={onBack ?? (() => router.back())}
                accessibilityRole="button"
              >
                <Text fontSize={15} color="$brandChalkDim">
                  ← {t.common.back}
                </Text>
              </Pressable>
            ) : null}

            {header}

            <YStack gap="$2">
              <Text fontSize={32} lineHeight={37} fontWeight="800" color="$brandChalk" letterSpacing={-0.6}>
                {title}
              </Text>
              <Text fontSize={16} lineHeight={22} color="$brandChalkDim">
                {subtitle}
              </Text>
            </YStack>

            <YStack gap="$4">{children}</YStack>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </PitchBackdrop>
  );
}
