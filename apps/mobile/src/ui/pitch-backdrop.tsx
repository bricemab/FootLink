import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';

/**
 * Fond de marque : nuit de terrain + deux halos verts qui respirent lentement.
 *
 * Les halos sont animés en boucle sur le thread UI (Reanimated via Moti) : la
 * scène reste à 60 fps même pendant qu'un écran fait un appel réseau.
 */
export function PitchBackdrop({ children }: { children: ReactNode }): ReactNode {
  const insets = useSafeAreaInsets();

  return (
    <YStack flex={1} backgroundColor="$brandNight">
      <MotiView
        pointerEvents="none"
        style={[styles.halo, styles.haloTop]}
        from={{ opacity: 0.28, scale: 1 }}
        animate={{ opacity: 0.5, scale: 1.25 }}
        transition={{ type: 'timing', duration: 5200, loop: true, repeatReverse: true }}
      />
      <MotiView
        pointerEvents="none"
        style={[styles.halo, styles.haloBottom]}
        from={{ opacity: 0.22, scale: 1.15 }}
        animate={{ opacity: 0.4, scale: 1 }}
        transition={{ type: 'timing', duration: 6400, loop: true, repeatReverse: true }}
      />
      <YStack
        flex={1}
        paddingTop={insets.top + 12}
        paddingBottom={insets.bottom + 16}
        paddingHorizontal="$4"
      >
        {children}
      </YStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  haloTop: {
    top: -150,
    right: -110,
    backgroundColor: '#1DBF73',
  },
  haloBottom: {
    bottom: -190,
    left: -130,
    backgroundColor: '#0F7A4A',
  },
});
