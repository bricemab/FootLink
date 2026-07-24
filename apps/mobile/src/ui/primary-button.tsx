import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
}

/**
 * Bouton principal. L'enfoncement est animé sur le thread UI : la réponse
 * tactile reste immédiate même si le JS est occupé par un appel réseau.
 */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'solid',
}: PrimaryButtonProps): ReactNode {
  const inactive = disabled || loading;
  const solid = variant === 'solid';

  return (
    <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button">
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed && !inactive ? 0.965 : 1, opacity: inactive ? 0.55 : 1 }}
          transition={{ type: 'timing', duration: 110 }}
        >
          <XStack
            height={56}
            borderRadius={18}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            backgroundColor={solid ? '$brandPitchBright' : 'transparent'}
            borderWidth={solid ? 0 : 1}
            borderColor="$brandChalkDim"
          >
            {loading ? (
              <ActivityIndicator color={solid ? '#07130F' : '#F4FBF7'} />
            ) : (
              <Text
                fontSize={17}
                fontWeight="700"
                letterSpacing={0.2}
                color={solid ? '$brandNight' : '$brandChalk'}
              >
                {label}
              </Text>
            )}
          </XStack>
        </MotiView>
      )}
    </Pressable>
  );
}
