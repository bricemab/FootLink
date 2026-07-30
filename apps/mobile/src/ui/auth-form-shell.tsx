import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { ChevronIcon } from '@/ui/icons';
import { PitchBackdrop } from '@/ui/pitch-backdrop';
import { TYPE } from '@/ui/type-scale';

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
  allowStackBack = true,
  children,
}: {
  title: string;
  subtitle: string;
  /** Zone au-dessus du titre : sert au stepper des inscriptions en étapes. */
  header?: ReactNode;
  /** Remplace le retour de navigation, pour revenir à l'étape précédente. */
  onBack?: () => void;
  /**
   * Faux = à défaut d'`onBack`, ne PAS proposer le retour de navigation. À
   * mettre sur un écran obligatoire : l'onboarding est atteint par redirection
   * alors que la session est ouverte, et `router.back()` y renvoyait sur
   * l'écran de connexion — une porte de sortie d'un passage obligé.
   */
  allowStackBack?: boolean;
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const { t } = useI18n();

  // Parenthèses volontaires : `??` lie plus fort que `?:`, donc
  // `onBack ?? router.canGoBack() ? …` ne testait pas ce qu'il semblait dire.
  const showBack = onBack !== undefined || (allowStackBack && router.canGoBack());

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
            {showBack ? (
              <Pressable onPress={onBack ?? (() => router.back())} accessibilityRole="button">
                {/* Une icone, pas « ← ». Meme regle qu'ailleurs : un glyphe ne
                    se rend pas pareil d'un appareil a l'autre. */}
                <XStack alignItems="center" gap="$1.5">
                  <ChevronIcon direction="left" size={18} color="rgba(169,196,184,0.9)" />
                  <Text {...TYPE.body} color="$brandChalkDim">
                    {t.common.back}
                  </Text>
                </XStack>
              </Pressable>
            ) : null}

            {header}

            <YStack gap="$2">
              <Text {...TYPE.title} color="$brandChalk">
                {title}
              </Text>
              <Text {...TYPE.heading} color="$brandChalkDim">
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
