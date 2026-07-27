import { MotiView } from 'moti';
import type { ReactNode } from 'react';

/**
 * Entrée en cascade du contenu d'un écran.
 *
 * 🔴 **Les valeurs de départ sont volontairement DOUCES, et ce n'est pas une
 * timidité de goût.** Sur un rendu logiciel — l'émulateur — une animation
 * d'entrée ne se joue pas toujours, et ses valeurs de départ **persistent**
 * alors à l'écran. L'app en a déjà fait les frais : `opacity: 0` laissait un
 * écran vide, `translateX: 28` laissait le contenu décalé hors marge (voir
 * `StepTransition`, qui a fini par renoncer à toute animation).
 *
 * On ne renonce pas ici, on choisit des états de départ dont l'échec est
 * **inoffensif** :
 *
 * - `opacity: 0.55` bloqué → contenu un peu terne, parfaitement lisible ;
 * - `scale: 0.98` bloqué → 2 % plus petit, invisible à l'œil ;
 * - `translateY: 6` bloqué → six pixels plus bas, sans casser la mise en page.
 *
 * Aucun de ces trois n'est un écran cassé. C'est ce qui permet d'avoir enfin du
 * mouvement sans reprendre le risque documenté.
 *
 * ⚠️ **Jamais de boucle.** Une surface animée en permanence recompose au CPU à
 * chaque image sur l'émulateur, ce qui a déjà valu un « FootLink isn't
 * responding » (cf. `PitchBackdrop`). Ces animations se terminent, toutes.
 */
export function Appear({
  children,
  /** Rang dans la liste : c'est lui qui crée la cascade. */
  index = 0,
  /**
   * Décalage entre deux éléments. 45 ms : en dessous la cascade ne se perçoit
   * pas, au-dessus le dernier élément se fait attendre.
   */
  step = 45,
}: {
  children: ReactNode;
  index?: number;
  step?: number;
}): ReactNode {
  return (
    <MotiView
      from={{ opacity: 0.55, scale: 0.98, translateY: 6 }}
      animate={{ opacity: 1, scale: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration: 280,
        // Plafonné : au-delà de six éléments, la cascade deviendrait une
        // attente. Les suivants arrivent avec le sixième.
        delay: Math.min(index, 6) * step,
      }}
    >
      {children}
    </MotiView>
  );
}
