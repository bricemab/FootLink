import { MotiView } from 'moti';
import { useState, type ReactNode } from 'react';
import { TextInput, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { Text, YStack } from 'tamagui';

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
}: TextFieldProps): ReactNode {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? '#FF5A5F' : focused ? '#39FF88' : 'rgba(244,251,247,0.18)';

  return (
    <YStack gap="$2">
      <Text fontSize={13} fontWeight="600" color="$brandChalkDim" letterSpacing={0.4}>
        {label.toUpperCase()}
      </Text>
      <MotiView
        animate={{ borderColor, backgroundColor: focused ? 'rgba(20,53,42,0.85)' : 'rgba(14,36,28,0.7)' }}
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
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          style={{
            height: 54,
            paddingHorizontal: 16,
            fontSize: 16,
            color: '#F4FBF7',
          }}
        />
      </MotiView>
      {error ? (
        <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }}>
          <Text fontSize={13} color="$brandDanger">
            {error}
          </Text>
        </MotiView>
      ) : null}
    </YStack>
  );
}
