import { MotiView } from 'moti';
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';

/**
 * Vrai quand l'écran est encadré par un habillage — en-tête en haut, barre
 * d'onglets en bas — qui **possède déjà les zones de sécurité et le décor**.
 *
 * Un seul signal pour trois conséquences, parce que c'est un seul fait :
 *
 * 1. l'écran ne repeint pas de fond : il couvrirait les halos de la racine, et
 *    précisément là où on veut les voir, sous l'en-tête et sous la barre ;
 * 2. il n'ajoute pas `insets.top` : l'en-tête a déjà consommé la barre d'état ;
 * 3. il n'ajoute pas `insets.bottom` : la barre d'onglets descend jusqu'au bord
 *    et réserve elle-même la barre de gestes. L'ajouter une seconde fois
 *    creusait un trou de deux zones de sécurité entre le dernier bouton et les
 *    icônes.
 *
 * Un contexte plutôt qu'une prop : être encadré est une propriété de l'ARBRE,
 * pas de l'écran. Aucun écran n'a à savoir qui le contient — et une prop aurait
 * dû traverser une quinzaine de fichiers pour dire la même chose.
 */
const InsideChrome = createContext(false);

/** Voir `InsideChrome`. Utilisé par `AppScreen` pour ses marges du bas. */
export function useInsideChrome(): boolean {
  return useContext(InsideChrome);
}

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
  const framed = useInsideChrome();

  /*
   * Encadré ⇒ cet écran ne garde que sa marge horizontale. Ni couleur, ni halo
   * (ils couvriraient ceux de la racine), ni zone de sécurité — l'habillage les
   * possède déjà, aux deux bouts. Voir `InsideChrome`.
   */
  if (framed) {
    return (
      <YStack flex={1} paddingHorizontal="$4">
        {children}
      </YStack>
    );
  }

  // Écran nu, sans habillage : il porte lui-même le décor et les deux zones
  // de sécurité.
  return (
    <YStack flex={1} backgroundColor="$brandNight">
      <Halos />
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

/**
 * Le décor seul, plein écran, sans aucune marge.
 *
 * À poser à la racine d'un espace qui a son propre en-tête et sa propre barre
 * d'onglets : le décor passe alors DERRIÈRE eux, et les halos ne s'arrêtent plus
 * net à leur bord. Les écrans imbriqués n'en repeignent pas un second — voir
 * `InsideChrome`.
 *
 * Le contenu, lui, ne passe pas dessous : la barre et l'en-tête occupent leur
 * place dans la mise en page, ils ne flottent pas.
 */
export function BackdropRoot({ children }: { children: ReactNode }): ReactNode {
  return (
    <InsideChrome.Provider value={true}>
      <YStack flex={1} backgroundColor="$brandNight">
        <Halos />
        {children}
      </YStack>
    </InsideChrome.Provider>
  );
}

/**
 * Les deux disques verts. Extraits pour être dessinés à l'identique par les deux
 * points d'entrée — dupliqués, ils auraient fini par diverger, et un décor qui
 * change selon l'écran se remarque.
 */
function Halos(): ReactNode {
  return (
    <>
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
    </>
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
