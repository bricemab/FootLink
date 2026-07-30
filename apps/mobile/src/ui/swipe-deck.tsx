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
import { Text, XStack, YStack } from 'tamagui';
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
  stamps,
}: {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  /** `right` = ça m'intéresse, `left` = je passe. */
  onDecision: (item: T, direction: 'left' | 'right') => void;
  onEmpty?: ReactNode;
  /**
   * Les deux mots imprimés sur la carte pendant le geste.
   *
   * Injectés et non codés ici : le deck ne connaît ni le domaine ni la langue.
   */
  stamps: { yes: string; no: string };
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

  /*
   * Le verdict qui se révèle pendant le geste : on voit sa décision arriver.
   *
   * Il grandit en même temps qu'il apparaît (0.7 → 1). Une simple opacité
   * donnait un tampon posé là ; l'échelle le fait *s'abattre* sur la carte, et
   * c'est ce mouvement qu'on reconnaît d'ailleurs.
   *
   * ⚠️ Le tampon « oui » est à GAUCHE et le « non » à DROITE, à l'opposé du
   * sens du geste. C'est la convention du genre, et elle a une raison : la main
   * qui pousse la carte vers la droite couvre le bord droit. Un tampon posé
   * sous le pouce ne se voit pas.
   */
  const yesStyle = useAnimatedStyle(() => {
    const progress = interpolate(x.value, [0, DECISION_THRESHOLD], [0, 1], 'clamp');
    return { opacity: progress, transform: [{ scale: interpolate(progress, [0, 1], [0.7, 1]) }] };
  });
  const noStyle = useAnimatedStyle(() => {
    const progress = interpolate(x.value, [-DECISION_THRESHOLD, 0], [1, 0], 'clamp');
    return { opacity: progress, transform: [{ scale: interpolate(progress, [0, 1], [0.7, 1]) }] };
  });

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
    // `flex={1}` : le paquet occupe toute la hauteur qu'on lui laisse, et les
    // cartes avec lui. Une carte de la taille de son contenu se perdait en haut
    // d'un grand écran vide.
    <YStack flex={1} position="relative">
      {next !== undefined ? (
        <Animated.View
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, nextStyle]}
        >
          {renderCard(next, 1)}
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, cardStyle]}>
          {renderCard(top, 0)}

          {/*
            Les deux verdicts, superposés à la carte. Ils n'interceptent aucun
            appui : le geste appartient à la carte entière.

            ⚠️ **Au tiers de la hauteur, pas en haut.** Colles au bord superieur,
            ils tombaient exactement sur le nom du club — le tampon et le nom
            devenaient illisibles ensemble. A cette hauteur ils se posent sur le
            terrain, qui supporte un calque sans rien perdre.
          */}
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: '30%', left: 22 }, yesStyle]}
          >
            <Verdict accept label={stamps.yes} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: '30%', right: 22 }, noStyle]}
          >
            <Verdict accept={false} label={stamps.no} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </YStack>
  );
}

/**
 * Le tampon de verdict.
 *
 * 🔴 **Un tampon, pas une pastille.** C'était un rond avec une icône : lisible,
 * mais muet — un rond vert ne dit pas *ce qu'on est en train de faire*. Le mot
 * écrit en gros, incliné, avec un liseré épais, dit « POSTULER » ou « PASSER »
 * avant que le doigt ne lâche. C'est le seul endroit de l'app où l'inclinaison
 * est justifiée : elle imite un tampon qu'on abat, et elle distingue
 * immédiatement cette couche de la carte qui est dessous, parfaitement droite.
 *
 * ⚠️ **Des icônes SVG, pas des glyphes.** La première version utilisait « ✓ » et
 * « ✕ » avec un commentaire s'accordant une exception. Il n'y en a pas : le
 * rendu d'un glyphe change d'un appareil et d'une version d'OS à l'autre, et
 * c'est exactement ce que la règle du projet interdit. `CheckIcon` et
 * `CrossIcon` existent pour ça.
 */
function Verdict({ accept, label }: { accept: boolean; label: string }): ReactNode {
  const color = accept ? '#39FF88' : '#FF5A5F';
  return (
    <XStack
      alignItems="center"
      gap="$2"
      paddingHorizontal="$3.5"
      paddingVertical="$2"
      borderRadius={14}
      borderWidth={3}
      borderColor={color}
      backgroundColor="rgba(7,19,15,0.72)"
      rotate={accept ? '-14deg' : '14deg'}
    >
      {accept ? <CheckIcon size={22} /> : <CrossIcon size={22} />}
      <Text fontSize={20} fontWeight="900" letterSpacing={1.2} color={color}>
        {label.toUpperCase()}
      </Text>
    </XStack>
  );
}

