import {
  categoriesForTeamGender,
  categoryLabel,
  type CategoryCode,
  type Gender,
} from '@footlink/shared';
import { MotiView } from 'moti';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { CheckIcon, ChevronIcon } from '@/ui/icons';
import { TYPE } from '@/ui/type-scale';

/**
 * Choix de la catégorie d'une équipe.
 *
 * La liste dépend du **genre** de l'équipe : les ligues féminines n'ont rien à
 * faire dans une équipe masculine, et l'inverse. Elle vient de
 * `categoriesForTeamGender` (`packages/shared`) — la question « qu'un club peut
 * engager » y est distincte de « ce qu'un joueur peut jouer », qui dépend elle
 * d'une année de naissance.
 *
 * Même forme que `RegionPicker` : une ligne, la liste s'ouvre à la demande. Une
 * quinzaine d'entrées à plat mangerait tout le formulaire.
 */
export function CategoryPicker({
  gender,
  value,
  onChange,
  error,
}: {
  gender: Gender;
  value: CategoryCode | undefined;
  onChange: (category: CategoryCode) => void;
  error?: string | undefined;
}): ReactNode {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const categories = useMemo(() => categoriesForTeamGender(gender), [gender]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) {
      return categories;
    }
    return categories.filter((category) =>
      categoryLabel(category, locale).toLowerCase().includes(needle),
    );
  }, [categories, search, locale]);

  const borderColor = error ? '#FF5A5F' : 'rgba(244,251,247,0.18)';

  return (
    <YStack gap="$2">
      <Text {...TYPE.meta} color="$brandChalkDim">
        {t.teams.category.toUpperCase()}
      </Text>

      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        {({ pressed }) => (
          <MotiView
            animate={{ borderColor: pressed ? '#39FF88' : borderColor }}
            transition={{ type: 'timing', duration: 140 }}
            style={{ borderWidth: 1.5, borderRadius: 16 }}
          >
            <XStack
              height={54}
              alignItems="center"
              justifyContent="space-between"
              paddingHorizontal="$3.5"
              gap="$3"
              backgroundColor="rgba(14,36,28,0.7)"
              borderRadius={14}
            >
              <Text {...TYPE.body} flexShrink={1} color={value ? '$brandChalk' : '$brandChalkDim'}>
                {value ? categoryLabel(value, locale) : t.teams.categoryChoose}
              </Text>
              <ChevronIcon direction="down" />
            </XStack>
          </MotiView>
        )}
      </Pressable>

      {error ? (
        <Text {...TYPE.meta} color="$brandDanger">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <YStack flex={1} backgroundColor="rgba(7,19,15,0.94)" paddingTop={insets.top + 24}>
          <YStack flex={1} paddingHorizontal="$4" gap="$4">
            <XStack justifyContent="space-between" alignItems="center">
              <Text {...TYPE.subtitle} color="$brandChalk">
                {t.teams.categoryChoose}
              </Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                <Text {...TYPE.body} color="$brandPitchBright" fontWeight="700">
                  {t.club.regionClose}
                </Text>
              </Pressable>
            </XStack>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.teams.categorySearch}
              placeholderTextColor="rgba(169,196,184,0.5)"
              autoCorrect={false}
              style={{
                height: 50,
                paddingHorizontal: 16,
                fontSize: 16,
                color: '#F4FBF7',
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: 'rgba(244,251,247,0.18)',
                backgroundColor: 'rgba(14,36,28,0.7)',
              }}
            />

            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 8 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filtered.map((category) => {
                const active = category === value;
                return (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(category);
                      setSearch('');
                      setOpen(false);
                    }}
                  >
                    <XStack
                      alignItems="center"
                      justifyContent="space-between"
                      gap="$3"
                      paddingVertical="$3.5"
                      paddingHorizontal="$3.5"
                      borderRadius={14}
                      borderWidth={1.5}
                      borderColor={active ? '#39FF88' : 'rgba(244,251,247,0.14)'}
                      backgroundColor="rgba(14,36,28,0.7)"
                    >
                      <Text {...TYPE.body} color="$brandChalk" flexShrink={1}>
                        {categoryLabel(category, locale)}
                      </Text>
                      {active ? <CheckIcon /> : null}
                    </XStack>
                  </Pressable>
                );
              })}
            </ScrollView>
          </YStack>
        </YStack>
      </Modal>
    </YStack>
  );
}
