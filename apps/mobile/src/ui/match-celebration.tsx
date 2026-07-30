import { MotiView } from 'moti';
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { hapticSuccess } from '@/ui/haptics';
import { BallIcon, StadiumIcon } from '@/ui/icons';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Le moment où les deux se sont choisis.
 *
 * 🔴 **C'est LE moment du produit, et il n'avait droit qu'à une phrase grise.**
 * Tout le reste — le feed, les critères, la distance — n'existe que pour
 * amener ici. Un match tenait dans une bannière d'information, au même niveau
 * visuel qu'un message d'erreur de formulaire. Le déséquilibre était total :
 * l'app travaillait beaucoup et ne célébrait rien.
 *
 * Ce que l'écran raconte, en une seconde et demie : **deux camps se
 * rejoignent**. Les deux pastilles arrivent des deux bords, se rencontrent au
 * centre, et une onde part de leur point de rencontre. Le mouvement dit la
 * chose avant que le texte ne la nomme.
 *
 * ⚠️ **Tout se termine.** Aucune boucle, aucune respiration infinie : sur un
 * rendu logiciel, deux disques animés en continu suffisent à saturer le
 * RenderThread et ont déjà valu un « FootLink isn't responding » (cf.
 * `pitch-backdrop.tsx`). Ici les animations durent moins de deux secondes et
 * s'arrêtent.
 *
 * ⚠️ **Aucun bouton « Écrire ».** La messagerie n'existe pas encore ; un bouton
 * qui n'ouvre rien transformerait le plus beau moment de l'app en déception.
 * On dit ce qui se passe, et on renvoie là où la relation est visible.
 */
export function MatchCelebration({
  visible,
  clubName,
  subtitle,
  onClose,
  onSeeMore,
  seeMoreLabel,
}: {
  visible: boolean;
  /** Le club, nommé : « vous êtes en relation » sans dire avec qui ne vaut rien. */
  clubName: string;
  /** Le poste, ou ce qui a produit la rencontre. */
  subtitle: string;
  onClose: () => void;
  /** Absent = seul « Continuer » est proposé. */
  onSeeMore?: () => void;
  seeMoreLabel?: string;
}): ReactNode {
  const { t } = useI18n();

  /*
    Le retour haptique part avec l'animation, pas au montage du composant : il
    doit coïncider avec la rencontre des deux pastilles, sinon il se lit comme
    une notification et non comme une célébration.
  */
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => hapticSuccess(), 420);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Un appui n'importe où ferme : au sommet de l'émotion, on ne cherche
          pas une croix. Les boutons restent, pour ceux qui les cherchent. */}
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button">
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal="$5"
          gap="$5"
          backgroundColor="rgba(4,12,9,0.94)"
        >
          {/* L'onde, partie du point de rencontre. Une seule, et elle s'éteint. */}
          <MotiView
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 220,
              height: 220,
              borderRadius: 110,
              borderWidth: 2,
              borderColor: '#39FF88',
            }}
            from={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 0, scale: 2.6 }}
            transition={{ type: 'timing', duration: 900, delay: 420 }}
          />

          <XStack alignItems="center" justifyContent="center">
            <Emblem side="left">
              <StadiumIcon size={38} />
            </Emblem>
            <Emblem side="right">
              <BallIcon size={38} />
            </Emblem>
          </XStack>

          <MotiView
            from={{ opacity: 0.4, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 13, stiffness: 160, delay: 520 }}
          >
            <YStack alignItems="center" gap="$2">
              <Text
                fontSize={34}
                lineHeight={38}
                fontWeight="900"
                letterSpacing={-0.8}
                color="$brandPitchBright"
                textAlign="center"
              >
                {t.match.title}
              </Text>
              <Text
                fontSize={19}
                fontWeight="700"
                color="$brandChalk"
                textAlign="center"
              >
                {clubName}
              </Text>
              <Text fontSize={15} color="$brandChalkDim" textAlign="center">
                {subtitle}
              </Text>
              <Text
                fontSize={14.5}
                lineHeight={21}
                color="$brandChalkDim"
                textAlign="center"
                marginTop="$2"
              >
                {t.match.body}
              </Text>
            </YStack>
          </MotiView>

          <MotiView
            from={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 260, delay: 760 }}
            style={{ alignSelf: 'stretch' }}
          >
            <YStack gap="$2.5" alignSelf="stretch">
              {onSeeMore && seeMoreLabel ? (
                <PrimaryButton label={seeMoreLabel} onPress={onSeeMore} />
              ) : null}
              <PrimaryButton label={t.match.continue} variant="ghost" onPress={onClose} />
            </YStack>
          </MotiView>
        </YStack>
      </Pressable>
    </Modal>
  );
}

/**
 * Une des deux pastilles qui se rejoignent.
 *
 * ⚠️ **L'état de départ est décalé, jamais invisible.** Si l'animation ne se
 * jouait pas — le cas connu du rendu logiciel — on verrait deux pastilles mal
 * placées, ce qui reste lisible ; à `opacity: 0` on ne verrait rien du tout et
 * l'écran paraîtrait cassé. Même règle que `Appear`.
 *
 * Le chevauchement de 14 px n'est pas décoratif : les deux disques se
 * superposent légèrement à l'arrivée, ce qui les lie au lieu de les juxtaposer.
 */
function Emblem({ side, children }: { side: 'left' | 'right'; children: ReactNode }): ReactNode {
  const from = side === 'left' ? -150 : 150;
  return (
    <MotiView
      from={{ translateX: from, opacity: 0.45, scale: 0.8 }}
      animate={{ translateX: side === 'left' ? 14 : -14, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 12, stiffness: 140, delay: 120 }}
    >
      <YStack
        width={92}
        height={92}
        borderRadius={46}
        alignItems="center"
        justifyContent="center"
        backgroundColor="rgba(9,24,18,0.98)"
        borderWidth={2.5}
        borderColor="rgba(57,255,136,0.55)"
        shadowColor="#39FF88"
        shadowOpacity={0.35}
        shadowRadius={20}
        shadowOffset={{ width: 0, height: 6 }}
        elevation={10}
      >
        {children}
      </YStack>
    </MotiView>
  );
}
