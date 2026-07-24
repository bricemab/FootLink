import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Text, XStack } from 'tamagui';

/** Bandeau de retour (erreur ou succès) sous un formulaire. */
export function FormBanner({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: 'error' | 'success';
}): ReactNode {
  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 200 }}
    >
      <XStack
        borderRadius={14}
        paddingVertical="$3"
        paddingHorizontal="$3.5"
        backgroundColor={tone === 'error' ? 'rgba(255,90,95,0.14)' : 'rgba(57,255,136,0.14)'}
        borderWidth={1}
        borderColor={tone === 'error' ? 'rgba(255,90,95,0.4)' : 'rgba(57,255,136,0.4)'}
      >
        <Text fontSize={14} lineHeight={20} color={tone === 'error' ? '$brandDanger' : '$brandPitchBright'}>
          {message}
        </Text>
      </XStack>
    </MotiView>
  );
}
