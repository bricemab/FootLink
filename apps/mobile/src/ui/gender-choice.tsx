import type { Gender } from '@footlink/shared';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';

/**
 * Choix masculin / féminin, à deux boutons.
 *
 * Le libellé est fourni par l'appelant parce que la chose désignée change : sur
 * un profil c'est le **genre de la personne**, sur une équipe c'est le **genre
 * de l'équipe**, qui décide de ses catégories possibles et de qui peut postuler.
 * Deux notions distinctes, un même geste.
 */
export function GenderChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Gender;
  onChange: (next: Gender) => void;
}): ReactNode {
  const { t } = useI18n();
  const options: { key: Gender; label: string }[] = [
    { key: 'MALE', label: t.onboarding.male },
    { key: 'FEMALE', label: t.onboarding.female },
  ];

  return (
    <YStack gap="$2">
      <Text fontSize={12.5} fontWeight="700" color="$brandChalkDim" letterSpacing={0.6}>
        {label.toUpperCase()}
      </Text>
      <XStack gap="$2">
        {options.map((option) => {
          const active = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{ flex: 1 }}
            >
              <XStack
                height={50}
                alignItems="center"
                justifyContent="center"
                borderRadius={14}
                borderWidth={1.5}
                borderColor={active ? '#39FF88' : 'rgba(244,251,247,0.16)'}
                backgroundColor={active ? 'rgba(57,255,136,0.14)' : 'rgba(12,30,23,0.85)'}
              >
                <Text
                  fontSize={15}
                  fontWeight={active ? '700' : '500'}
                  color={active ? '$brandPitchBright' : '$brandChalk'}
                >
                  {option.label}
                </Text>
              </XStack>
            </Pressable>
          );
        })}
      </XStack>
    </YStack>
  );
}
