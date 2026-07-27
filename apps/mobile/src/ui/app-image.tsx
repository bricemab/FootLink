import { requireOptionalNativeModule } from 'expo-modules-core';
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
 * 🔴 **Le test porte sur le module NATIF, pas sur le paquet JavaScript.**
 *
 * Premiere version : un `require('expo-image')` dans un `try`. Elle ne
 * protegeait rien. Le paquet JS est bien present dans `node_modules` des
 * l'installation, donc le `require` REUSSIT — c'est la vue native qui manque
 * tant que l'app n'a pas ete reconstruite, et l'erreur ne sort qu'au rendu :
 * « Cannot find native module ExpoImage », ecran casse. Brice l'a pris de
 * plein fouet.
 *
 * `requireOptionalNativeModule` interroge le registre natif et renvoie `null`
 * quand le module n'y est pas. C'est le seul test qui distingue « paquet
 * installe » de « binaire embarque dans le build ».
 *
 * Concretement : l'app fonctionne avant ET apres la reconstruction, avec le
 * fondu en plus une fois reconstruite.
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
      // Le nom est celui du module NATIF (`ExpoImage`), pas celui du paquet npm.
      if (requireOptionalNativeModule('ExpoImage') === null) {
        ExpoImage = null;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ExpoImage = (require('expo-image') as { Image: (props: ExpoImageProps) => ReactNode })
          .Image;
      }
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
