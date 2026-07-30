import { useCallback, type ReactNode } from 'react';
import { Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { hapticSuccess, hapticTap } from '@/ui/haptics';
import { CheckIcon, CrossIcon } from '@/ui/icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Distance à partir de laquelle le geste est une décision.
 *
 * Un quart de l'écran : assez pour qu'un frôlement ne décide de rien, assez peu
 * pour qu'on n'ait pas à traverser l'écran entier. C'est le seuil que la carte
 * annonce visuellement au fur et à mesure — l'utilisateur voit venir sa propre
 * décision avant de la prendre.
 */
const DECISION_THRESHOLD = SCREEN_WIDTH * 0.25;

/**
 * Deck de cartes à faire glisser.
 *
 * 🔴 **La carte suit le doigt, elle ne se contente pas de disparaître.** C'est
 * toute la différence entre un prototype et une app dont le geste inspire
 * confiance : on voit la carte pencher, on voit l'intention se former, et on
 * peut encore changer d'avis en revenant en arrière. Un geste qui ne rend rien
 * pendant qu'il se fait laisse un doute sur ce qui va se passer.
 *
 * Trois choses qui font que ça « tient » sous le doigt :
 *
 * - **la rotation suit la position**, comme une carte posée qu'on pousse par un
 *   coin, et non un bloc qui translate ;
 * - **le retour est un RESSORT** et non une durée fixe : un geste annulé revient
 *   avec l'élan qu'on lui a donné ;
 * - **le retour haptique n'arrive qu'à la décision**, jamais pendant le
 *   glissement. Vibrer en continu transformerait le geste en bourdonnement.
 *
 * ⚠️ Le geste et l'animation vivent sur le fil d'UI (Reanimated) : ils
 * continuent même si le fil JavaScript est occupé à charger la page suivante.
 * C'est précisément pour ça qu'on ne pilote pas ça avec `useState`.
 */
export function SwipeDeck<T>({
  items,
  renderCard,
  onDecision,
  onEmpty,
}: {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  /** `right` = ça m'intéresse, `left` = je passe. */
  onDecision: (item: T, direction: 'left' | 'right') => void;
  onEmpty?: ReactNode;
}): ReactNode {
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const top = items[0];
  const next = items[1];

  const decide = useCallback(
    (direction: 'left' | 'right') => {
      if (top !== undefined) {
        /*
         * Deux retours DISTINCTS, et c'est volontaire : postuler engage, passer
         * n'engage rien. Le meme buzz pour les deux ferait du geste une routine
         * ou l'on ne sent plus ce qu'on vient de decider.
         */
        if (direction === 'right') {
          hapticSuccess();
        } else {
          hapticTap();
        }
        onDecision(top, direction);
      }
      x.value = 0;
      y.value = 0;
    },
    [onDecision, top, x, y],
  );

  const pan = Gesture.Pan()
    .onChange((event) => {
      x.value += event.changeX;
      y.value += event.changeY;
    })
    .onEnd((event) => {
      // La vélocité compte autant que la distance : un geste vif et court est
      // une décision aussi nette qu'un geste long et lent.
      const decided =
        Math.abs(x.value) > DECISION_THRESHOLD || Math.abs(event.velocityX) > 900;
      if (decided) {
        const direction = x.value > 0 ? 'right' : 'left';
        // La carte sort de l'écran AVANT que la liste change : sans ça, elle
        // disparaîtrait d'un coup et le geste n'aurait pas de fin visible.
        x.value = withTiming(
          Math.sign(x.value) * SCREEN_WIDTH * 1.5,
          { duration: 220 },
          () => {
            runOnJS(decide)(direction);
          },
        );
        return;
      }
      // Geste annulé : retour élastique, avec l'élan qu'on lui a donné.
      x.value = withSpring(0, { damping: 18, stiffness: 220, velocity: event.velocityX });
      y.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      // Pivot doux : au bord de l'écran la carte a tourné de 12°, pas plus —
      // au-delà elle donne le tournis au lieu de suivre la main.
      { rotate: `${interpolate(x.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-12, 0, 12])}deg` },
    ],
  }));

  /** Verdict qui se révèle pendant le geste : on voit sa décision arriver. */
  const yesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, DECISION_THRESHOLD], [0, 1], 'clamp'),
  }));
  const noStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-DECISION_THRESHOLD, 0], [1, 0], 'clamp'),
  }));

  /*
   * La carte suivante, légèrement en retrait et grandissante.
   *
   * Elle donne la profondeur du paquet — on sait qu'il y a une suite — et elle
   * se met en place pendant que la première sort, ce qui evite l'a-coup d'une
   * carte qui apparaîtrait de nulle part.
   */
  const nextStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(x.value) / DECISION_THRESHOLD, 1);
    return {
      transform: [{ scale: interpolate(progress, [0, 1], [0.94, 1]) }],
      opacity: interpolate(progress, [0, 1], [0.6, 1]),
    };
  });

  if (top === undefined) {
    return <>{onEmpty}</>;
  }

  return (
    <YStack position="relative">
      {next !== undefined ? (
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, nextStyle]}>
          {renderCard(next, 1)}
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          {renderCard(top, 0)}

          {/* Les deux verdicts, superposés à la carte. Ils n'interceptent aucun
              appui : le geste appartient à la carte entière. */}
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 18, left: 18 }, noStyle]}
          >
            <Verdict accept={false} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 18, right: 18 }, yesStyle]}
          >
            <Verdict accept />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </YStack>
  );
}

/**
 * Pastille de verdict.
 *
 * ⚠️ **Des icônes SVG, pas des glyphes.** La première version utilisait « ✓ » et
 * « ✕ » avec un commentaire s'accordant une exception. Il n'y en a pas : le
 * rendu d'un glyphe change d'un appareil et d'une version d'OS à l'autre, et
 * c'est exactement ce que la règle du projet interdit. `CheckIcon` et
 * `CrossIcon` existent pour ça.
 */
function Verdict({ accept }: { accept: boolean }): ReactNode {
  return (
    <YStack
      width={54}
      height={54}
      borderRadius={27}
      alignItems="center"
      justifyContent="center"
      backgroundColor="rgba(7,19,15,0.85)"
      borderWidth={2.5}
      borderColor={accept ? 'rgba(57,255,136,0.9)' : 'rgba(255,90,95,0.9)'}
    >
      {accept ? <CheckIcon size={26} /> : <CrossIcon size={26} />}
    </YStack>
  );
}

