import { MotiView } from 'moti';
import { useState, type ReactNode } from 'react';
import { TextInput, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { Text, YStack } from 'tamagui';
import { TYPE } from '@/ui/type-scale';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  error?: string | undefined;
  onSubmitEditing?: () => void;
  /**
   * Champ de plusieurs lignes (presentation d'un club, biographie).
   *
   * Change la hauteur ET desactive la correction automatique differemment : sur
   * un texte libre, l'autocorrection rend service, alors qu'elle abime une
   * adresse email ou un nom propre.
   */
  multiline?: boolean;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  error,
  onSubmitEditing,
  multiline = false,
}: TextFieldProps): ReactNode {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? '#FF5A5F' : focused ? '#39FF88' : 'rgba(244,251,247,0.18)';

  return (
    <YStack gap="$2">
      <Text {...TYPE.meta} color="$brandChalkDim">
        {label.toUpperCase()}
      </Text>
      <MotiView
        animate={{
          borderColor,
          backgroundColor: focused ? 'rgba(20,53,42,0.85)' : 'rgba(14,36,28,0.7)',
        }}
        transition={{ type: 'timing', duration: 160 }}
        style={{ borderWidth: 1.5, borderRadius: 16 }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(169,196,184,0.5)"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={multiline}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          style={{
            height: multiline ? 130 : 54,
            paddingHorizontal: 16,
            paddingVertical: multiline ? 14 : 0,
            fontSize: 16,
            lineHeight: multiline ? 22 : undefined,
            color: '#F4FBF7',
          }}
        />
      </MotiView>
      {/* Aucune animation d'entrée : un message d'erreur ne doit ni rester
          invisible ni rester décalé. Cf. `StepTransition`. */}
      {error ? (
        <Text {...TYPE.meta} color="$brandDanger">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
