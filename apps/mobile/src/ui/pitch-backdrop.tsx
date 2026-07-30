import { MotiView } from 'moti';
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';

/**
 * Ce que l'habillage autour de l'écran consomme DÉJÀ.
 *
 * 🔴 **Deux booléens et non un seul, parce que ce sont deux faits distincts.**
 * Il n'y en avait qu'un — « encadré » — qui valait pour les deux bouts à la
 * fois. Vrai côté club, où `ClubHeader` absorbe la barre d'état. Faux côté
 * joueur, qui n'a qu'une barre d'onglets : l'écran croyait son haut pris en
 * charge, n'ajoutait pas `insets.top`, et le titre passait sous l'horloge.
 * Brice l'a vu tout de suite. Un signal qui résume deux réalités finit toujours
 * par mentir sur l'une des deux.
 *
 * Conséquences, dans l'ordre :
 *
 * - `top` — un en-tête a consommé la barre d'état, l'écran n'y touche pas ;
 * - `bottom` — une barre d'onglets descend jusqu'au bord et réserve elle-même
 *   la barre de gestes. L'ajouter une seconde fois creusait un trou de deux
 *   zones de sécurité entre le dernier bouton et les icônes ;
 * - l'un ou l'autre vrai ⇒ l'écran ne repeint pas de fond : il couvrirait les
 *   halos de la racine, et précisément là où on veut les voir.
 *
 * Un contexte plutôt qu'une prop : être encadré est une propriété de l'ARBRE,
 * pas de l'écran. Aucun écran n'a à savoir qui le contient — et une prop aurait
 * dû traverser une quinzaine de fichiers pour dire la même chose.
 */
export interface Chrome {
  top: boolean;
  bottom: boolean;
}

const ChromeContext = createContext<Chrome>({ top: false, bottom: false });

/** Voir `Chrome`. Utilisé par `AppScreen` et `PitchBackdrop` pour leurs marges. */
export function useChrome(): Chrome {
  return useContext(ChromeContext);
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
  const chrome = useChrome();

  /*
   * Encadré d'AU MOINS un côté ⇒ pas de fond ni de halo (ils couvriraient ceux
   * de la racine). Chaque zone de sécurité, elle, est ajoutée SÉPARÉMENT : on
   * ne porte que celle que l'habillage ne porte pas. Voir `Chrome`.
   */
  if (chrome.top || chrome.bottom) {
    return (
      <YStack
        flex={1}
        paddingHorizontal="$4"
        paddingTop={chrome.top ? 0 : insets.top + 12}
        paddingBottom={chrome.bottom ? 0 : insets.bottom + 16}
      >
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
 * À poser à la racine d'un espace qui a sa propre barre d'onglets : le décor
 * passe alors DERRIÈRE elle, et les halos ne s'arrêtent plus net à son bord.
 * Les écrans imbriqués n'en repeignent pas un second — voir `Chrome`.
 *
 * ⚠️ **`header` est obligatoire, sans valeur par défaut.** Il dit si un en-tête
 * consomme la barre d'état. Une valeur par défaut aurait l'air commode et
 * réintroduirait exactement le défaut qu'on vient de corriger : un espace sans
 * en-tête hériterait silencieusement de « oui », et son contenu repasserait
 * sous l'horloge. Ici, oublier ne compile pas.
 *
 * Le contenu ne passe pas sous l'habillage : la barre et l'en-tête occupent
 * leur place dans la mise en page, ils ne flottent pas.
 */
export function BackdropRoot({
  children,
  header,
}: {
  children: ReactNode;
  header: boolean;
}): ReactNode {
  return (
    <ChromeContext.Provider value={{ top: header, bottom: true }}>
      <YStack flex={1} backgroundColor="$brandNight">
        <Halos />
        {children}
      </YStack>
    </ChromeContext.Provider>
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
