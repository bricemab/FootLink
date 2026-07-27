import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';

/**
 * Silhouette de contenu affichée pendant un chargement.
 *
 * 🔴 **Pourquoi remplacer les roues qui tournent.** Une roue au centre d'un
 * écran vide dit « attends » sans rien dire d'autre : la page n'existe pas
 * encore, et l'attente paraît d'autant plus longue qu'on ne sait pas ce qui
 * arrive. Une silhouette dessine déjà la forme de ce qui va venir — la même
 * durée d'attente est perçue comme nettement plus courte, et l'arrivée du
 * contenu ne fait plus sauter la mise en page.
 *
 * ⚠️ **L'animation part de l'état courant et boucle en opacité seulement.**
 * Pas de `scale`, pas de translation : sur l'émulateur, qui rend en logiciel,
 * animer la géométrie d'une pile de blocs fait grimper le RenderThread et a
 * déjà valu un « FootLink isn't responding » (cf. HANDOFF). L'opacité se
 * compose sans recalculer la mise en page.
 */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
}): ReactNode {
  return (
    <MotiView
      from={{ opacity: 0.35 }}
      animate={{ opacity: 0.7 }}
      transition={{ type: 'timing', duration: 900, loop: true }}
      style={{
        height,
        width: width as number,
        borderRadius: radius,
        backgroundColor: 'rgba(244,251,247,0.10)',
      }}
    />
  );
}

/**
 * Silhouette d'une carte de liste.
 *
 * Les proportions imitent `Card` : un titre, une ligne secondaire, une ligne de
 * méta. Ce n'est pas de la coquetterie — une silhouette qui ne ressemble pas au
 * contenu final produit un saut au moment du remplacement, exactement le défaut
 * qu'on cherche à éviter.
 */
export function SkeletonCard(): ReactNode {
  return (
    <YStack
      gap="$2.5"
      padding="$4"
      borderRadius={18}
      backgroundColor="rgba(12,30,23,0.55)"
      borderWidth={1.5}
      borderColor="rgba(244,251,247,0.08)"
    >
      <Skeleton height={18} width="55%" />
      <Skeleton height={14} width="35%" />
      <Skeleton height={13} width="70%" />
    </YStack>
  );
}

/**
 * Plusieurs silhouettes de cartes.
 *
 * `count` volontairement bas par défaut : montrer dix silhouettes pour une liste
 * qui en contiendra deux ment sur ce qui arrive, et le repli est plus brutal que
 * l'absence d'annonce.
 */
export function SkeletonList({ count = 2 }: { count?: number }): ReactNode {
  return (
    <YStack gap="$3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </YStack>
  );
}
