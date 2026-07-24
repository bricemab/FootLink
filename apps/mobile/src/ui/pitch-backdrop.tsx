import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';

/**
 * Fond de marque : nuit de terrain + deux halos verts.
 *
 * Les halos font UNE apparition en fondu, puis restent fixes.
 *
 * Ils « respiraient » auparavant en boucle infinie (scale + opacity via Moti).
 * Sur un rendu logiciel — le cas de l'émulateur Android — chaque frame
 * recompose au CPU ces deux disques de 380 px par-dessus le fond : le
 * RenderThread reste à ~65 %, la répartition des évènements tactiles est
 * affamée, et Android finit par afficher « FootLink isn't responding » (ANR).
 * `renderToHardwareTextureAndroid` n'y change rien : sans GPU réel, il n'y a pas
 * de texture à composer à moindre coût.
 *
 * Un fond animé en permanence n'est pas ce qui fait l'« effet WOW » — les
 * transitions d'entrée du contenu s'en chargent, et elles, se terminent. On
 * garde donc des halos immobiles. À rétablir éventuellement pour les builds de
 * production tournant sur du vrai matériel, jamais sur un rendu logiciel.
 */
export function PitchBackdrop({ children }: { children: ReactNode }): ReactNode {
  const insets = useSafeAreaInsets();

  return (
    <YStack flex={1} backgroundColor="$brandNight">
      {/* Fondu d'entrée unique (280 ms) : vivant, mais ça se termine. */}
      <MotiView
        style={[styles.halo, styles.haloTop]}
        from={{ opacity: 0 }}
        animate={{ opacity: 0.42 }}
        transition={{ type: 'timing', duration: 280 }}
      />
      <MotiView
        style={[styles.halo, styles.haloBottom]}
        from={{ opacity: 0 }}
        animate={{ opacity: 0.32 }}
        transition={{ type: 'timing', duration: 280 }}
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
    // Décoratif : ne doit jamais intercepter un appui destiné au contenu.
    pointerEvents: 'none',
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
