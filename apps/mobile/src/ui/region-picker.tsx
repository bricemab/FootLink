import { MotiView } from 'moti';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import type { Region } from '@/api/clubs';
import { useI18n } from '@/i18n';
import { CheckIcon, ChevronIcon } from '@/ui/icons';
import { TYPE } from '@/ui/type-scale';

/**
 * Choix de l'association régionale.
 *
 * Au MVP une seule est ouverte (AVF), mais l'ouverture nationale en amènera
 * treize : les afficher toutes à plat mangeait l'écran et noyait le reste du
 * formulaire. On montre donc une seule ligne, et la liste s'ouvre à la demande.
 *
 * Deux cas dégénérés valent mieux qu'un composant générique :
 * - une seule association ouverte -> elle est présélectionnée et affichée en
 *   simple information ; ouvrir une liste d'un élément n'a aucun intérêt ;
 * - aucune -> on n'affiche rien du tout.
 */
export function RegionPicker({
  regions,
  value,
  onChange,
}: {
  /** Uniquement les associations ouvertes. */
  regions: Region[];
  value: string | undefined;
  onChange: (code: string) => void;
}): ReactNode {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const label = (region: Region): string => (locale === 'DE' ? region.labelDe : region.labelFr);
  const selected = regions.find((region) => region.code === value);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) {
      return regions;
    }
    // On cherche aussi sur le code (avf, anf…) : c'est ce que les gens du
    // milieu ont en tête, et c'est bien plus court à taper que « Association
    // Cantonale Neuchâteloise de Football ».
    return regions.filter(
      (region) =>
        label(region).toLowerCase().includes(needle) || region.code.toLowerCase().includes(needle),
    );
    // `label` dépend de la locale, qui est stable pendant la saisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, search, locale]);

  if (regions.length === 0) {
    return null;
  }

  return (
    <YStack gap="$2">
      <Text {...TYPE.meta} color="$brandChalkDim">
        {t.club.region.toUpperCase()}
      </Text>

      {regions.length === 1 ? (
        // Rien à choisir : on informe, on ne demande pas.
        <XStack
          height={54}
          alignItems="center"
          paddingHorizontal="$3.5"
          borderRadius={16}
          borderWidth={1.5}
          borderColor="rgba(244,251,247,0.18)"
          backgroundColor="rgba(14,36,28,0.7)"
        >
          <Text {...TYPE.body} color="$brandChalk" flexShrink={1}>
            {label(regions[0])}
          </Text>
        </XStack>
      ) : (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
          {({ pressed }) => (
            <MotiView
              animate={{ borderColor: pressed ? '#39FF88' : 'rgba(244,251,247,0.18)' }}
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
                <Text
                  {...TYPE.body}
                  flexShrink={1}
                  color={selected ? '$brandChalk' : '$brandChalkDim'}
                >
                  {selected ? label(selected) : t.club.regionChoose}
                </Text>
                <ChevronIcon direction="down" />
              </XStack>
            </MotiView>
          )}
        </Pressable>
      )}

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
                {t.club.regionChoose}
              </Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                <Text {...TYPE.body} color="$brandPitchBright" fontWeight="700">
                  {t.club.regionClose}
                </Text>
              </Pressable>
            </XStack>

            {/* La recherche n'a de sens qu'au-delà de quelques entrées. */}
            {regions.length > 6 ? (
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t.club.regionSearch}
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
            ) : null}

            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 8 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filtered.length === 0 ? (
                <Text {...TYPE.body} color="$brandChalkDim" paddingVertical="$3">
                  {t.club.regionEmpty}
                </Text>
              ) : null}

              {filtered.map((region) => {
                const active = region.code === value;
                return (
                  <Pressable
                    key={region.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(region.code);
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
                        {label(region)}
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
