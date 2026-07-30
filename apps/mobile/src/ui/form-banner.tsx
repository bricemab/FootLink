import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { CheckIcon, WarningIcon } from '@/ui/icons';
import { TYPE } from '@/ui/type-scale';

/**
 * Bandeau de retour (erreur ou succès) sous un formulaire.
 *
 * L'icône dans sa pastille teintée porte le sens au premier regard, avant même
 * la lecture : rouge = quelque chose ne va pas, vert = c'est bon. Le texte
 * reste court et neutre à côté.
 */
const TONES = {
  error: { accent: '#FF5A5F', bg: 'rgba(255,90,95,0.10)', border: 'rgba(255,90,95,0.32)' },
  success: { accent: '#39FF88', bg: 'rgba(57,255,136,0.10)', border: 'rgba(57,255,136,0.32)' },
} as const;

export function FormBanner({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: 'error' | 'success';
}): ReactNode {
  const c = TONES[tone];

  // Aucune animation d'entrée : un bandeau d'erreur ne doit ni rester invisible
  // ni rester décalé si l'animation ne se joue pas. Cf. `StepTransition`.
  return (
    <XStack
      alignItems="center"
      gap="$3"
      borderRadius={16}
      paddingVertical="$3"
      paddingHorizontal="$3.5"
      backgroundColor={c.bg}
      borderWidth={1}
      borderColor={c.border}
    >
      {/* Pastille : l'icône y gagne un fond qui la détache du bandeau. */}
      <YStack
        width={30}
        height={30}
        borderRadius={15}
        alignItems="center"
        justifyContent="center"
        backgroundColor={tone === 'error' ? 'rgba(255,90,95,0.18)' : 'rgba(57,255,136,0.18)'}
      >
        {tone === 'error' ? (
          <WarningIcon size={17} color={c.accent} />
        ) : (
          <CheckIcon size={16} color={c.accent} />
        )}
      </YStack>

      <Text {...TYPE.body} color="$brandChalk" flexShrink={1} fontWeight="500">
        {message}
      </Text>
    </XStack>
  );
}
