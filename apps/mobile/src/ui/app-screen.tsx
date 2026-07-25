import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { PitchBackdrop } from '@/ui/pitch-backdrop';

/**
 * Enveloppe des écrans d'application : titre, retour, défilement.
 *
 * Distincte d'`AuthFormShell`, qui centre son contenu et évite le clavier —
 * deux comportements faux pour une liste, où le contenu part du haut et peut
 * dépasser l'écran.
 *
 * ⚠️ **Aucune animation d'entrée ici non plus.** Sur ce stack, une animation
 * d'entrée ne se joue pas toujours et ses valeurs de départ persistent alors à
 * l'écran : `opacity: 0` rend le contenu invisible, un `translate` le laisse
 * décalé. Voir le commentaire de `StepTransition`.
 */
export function AppScreen({
  title,
  subtitle,
  action,
  onBack,
  onRefresh,
  refreshing = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Zone à droite du titre : bouton d'ajout, compteur… */
  action?: ReactNode;
  /** Remplace le retour de navigation. Absent = retour de pile s'il en existe. */
  onBack?: () => void;
  /** Fourni = tirer pour rafraîchir. Une liste distante doit pouvoir être relue. */
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const showBack = onBack !== undefined || router.canGoBack();

  return (
    <PitchBackdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        {...(onRefresh
          ? {
              refreshControl: (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#39FF88"
                  colors={['#39FF88']}
                />
              ),
            }
          : {})}
      >
        <YStack gap="$4">
          {showBack ? (
            <Pressable onPress={onBack ?? (() => router.back())} accessibilityRole="button">
              <Text fontSize={15} color="$brandChalkDim">
                ← {t.common.back}
              </Text>
            </Pressable>
          ) : null}

          <XStack alignItems="flex-start" justifyContent="space-between" gap="$3">
            <YStack gap="$1.5" flexShrink={1}>
              <Text
                fontSize={30}
                lineHeight={35}
                fontWeight="800"
                color="$brandChalk"
                letterSpacing={-0.6}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text fontSize={15} lineHeight={21} color="$brandChalkDim">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            {action}
          </XStack>

          <YStack gap="$3">{children}</YStack>
        </YStack>
      </ScrollView>
    </PitchBackdrop>
  );
}

/** Carte de contenu, reprise partout dans les écrans club. */
export function Card({
  children,
  onPress,
  accent = false,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Vrai = liseré vert, pour l'élément qui porte l'action principale. */
  accent?: boolean;
}): ReactNode {
  const body = (
    <YStack
      gap="$2.5"
      padding="$4"
      borderRadius={18}
      backgroundColor="rgba(12,30,23,0.88)"
      borderWidth={1.5}
      borderColor={accent ? 'rgba(57,255,136,0.35)' : 'rgba(244,251,247,0.12)'}
    >
      {children}
    </YStack>
  );

  if (!onPress) {
    return body;
  }
  // Le retour au toucher part de l'état courant, donc rien ne peut rester figé.
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => <YStack opacity={pressed ? 0.72 : 1}>{body}</YStack>}
    </Pressable>
  );
}

/** Étiquette d'état : « en attente », « actif »… */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'warning';
}): ReactNode {
  // `as const` volontaire : sans lui les trois entrées s'unifient en `string`,
  // que Tamagui refuse — il attend soit un jeton de thème, soit une couleur.
  const palette = {
    neutral: {
      bg: 'rgba(244,251,247,0.10)',
      border: 'rgba(244,251,247,0.22)',
      fg: '$brandChalkDim',
    },
    accent: {
      bg: 'rgba(57,255,136,0.14)',
      border: 'rgba(57,255,136,0.38)',
      fg: '$brandPitchBright',
    },
    warning: { bg: 'rgba(255,176,32,0.14)', border: 'rgba(255,176,32,0.40)', fg: '#FFC14D' },
  } as const;
  const tones = palette[tone];

  return (
    <XStack
      paddingHorizontal="$2.5"
      paddingVertical="$1"
      borderRadius={999}
      backgroundColor={tones.bg}
      borderWidth={1}
      borderColor={tones.border}
    >
      <Text fontSize={11.5} fontWeight="700" letterSpacing={0.5} color={tones.fg}>
        {label.toUpperCase()}
      </Text>
    </XStack>
  );
}

/** Message d'absence de contenu. Une liste vide sans explication inquiète. */
export function EmptyState({ text }: { text: string }): ReactNode {
  return (
    <YStack
      padding="$4"
      borderRadius={18}
      borderWidth={1}
      borderColor="rgba(244,251,247,0.10)"
      backgroundColor="rgba(12,30,23,0.55)"
    >
      <Text fontSize={14.5} lineHeight={21} color="$brandChalkDim">
        {text}
      </Text>
    </YStack>
  );
}
