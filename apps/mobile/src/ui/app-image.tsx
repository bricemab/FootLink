import type { ReactNode } from 'react';
import { Image as RNImage } from 'react-native';

/**
 * Image distante : logo de club, photo de profil.
 *
 * `expo-image` apporte deux choses que l'`Image` de React Native n'a pas — un
 * fondu à l'arrivée plutôt qu'une apparition sèche, et un cache disque qui évite
 * de retélécharger un logo à chaque écran. Sur des URL signées et courtes, la
 * différence se voit tout de suite.
 *
 * 🔴 **Le repli n'est pas de la prudence décorative.** `expo-image` est un
 * module NATIF : sur un client de développement construit avant son ajout, sa
 * vue n'existe pas. Comme il est rendu dans l'arbre — et non appelé dans un
 * gestionnaire d'évènement, où un `import()` paresseux suffirait — on ne peut
 * pas le charger à la demande. On tente donc le `require` une fois, et on
 * retombe sur l'`Image` de React Native s'il n'est pas là.
 *
 * Concrètement : l'app fonctionne avant ET après la reconstruction, avec le
 * fondu en plus une fois reconstruite. Sans ce repli, tout écran affichant une
 * image tomberait tant que le build n'a pas suivi.
 */

interface ExpoImageProps {
  source: { uri: string };
  style: { width: number; height: number };
  contentFit?: 'cover' | 'contain';
  transition?: number;
  cachePolicy?: 'memory-disk';
}

let ExpoImage: ((props: ExpoImageProps) => ReactNode) | null | undefined;

function resolve(): ((props: ExpoImageProps) => ReactNode) | null {
  if (ExpoImage === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ExpoImage = (require('expo-image') as { Image: (props: ExpoImageProps) => ReactNode }).Image;
    } catch {
      ExpoImage = null;
    }
  }
  return ExpoImage;
}

export function AppImage({
  uri,
  size,
  contentFit = 'cover',
}: {
  uri: string;
  /** Carré : avatars et logos le sont tous les deux. */
  size: number;
  contentFit?: 'cover' | 'contain';
}): ReactNode {
  const Expo = resolve();
  if (Expo) {
    return (
      <Expo
        source={{ uri }}
        style={{ width: size, height: size }}
        contentFit={contentFit}
        // 220 ms : assez pour adoucir l'arrivée, assez court pour ne pas faire
        // attendre une image déjà en cache.
        transition={220}
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <RNImage
      source={{ uri }}
      style={{ width: size, height: size }}
      resizeMode={contentFit}
    />
  );
}
