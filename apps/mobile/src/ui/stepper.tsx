import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { TYPE } from '@/ui/type-scale';

/**
 * Progression d'un formulaire découpé en étapes.
 *
 * Trois informations, parce qu'aucune ne suffit seule : où on en est, combien
 * il en reste, et surtout ce que l'étape suivante va demander. Sans la
 * troisième, l'utilisateur avance à l'aveugle et abandonne plus facilement.
 */
export function Stepper({
  steps,
  current,
  stepLabel,
  nextLabel,
}: {
  steps: string[];
  /** Index de l'étape en cours, à partir de 0. */
  current: number;
  /** Ex. « Étape 2 sur 3 » — le gabarit vient de l'i18n. */
  stepLabel: string;
  /** Ex. « Ensuite : ton mot de passe ». Absent sur la dernière étape. */
  nextLabel?: string;
}): ReactNode {
  return (
    <YStack gap="$2.5">
      <XStack gap="$2">
        {steps.map((label, index) => (
          <MotiView
            key={label}
            style={{ flex: 1, height: 4, borderRadius: 2 }}
            animate={{
              backgroundColor:
                index < current
                  ? '#1DBF73'
                  : index === current
                    ? '#39FF88'
                    : 'rgba(244,251,247,0.16)',
            }}
            transition={{ type: 'timing', duration: 260 }}
          />
        ))}
      </XStack>

      <XStack justifyContent="space-between" alignItems="center" gap="$3">
        <Text {...TYPE.label} color="$brandPitchBright">
          {stepLabel.toUpperCase()}
        </Text>
        {nextLabel ? (
          <Text {...TYPE.label} color="$brandChalkDim" flexShrink={1} textAlign="right">
            {nextLabel}
          </Text>
        ) : null}
      </XStack>
    </YStack>
  );
}

/**
 * Marque le contenu d'une étape. **Sans animation d'entrée**, volontairement.
 *
 * Historique, pour ne pas refaire le tour : cette étape glissait depuis la
 * droite avec un fondu. Sur ce stack (rendu logiciel de l'émulateur), une
 * animation d'entrée ne se joue pas toujours — et ses valeurs de départ
 * **persistent** alors :
 *   - avec `opacity: 0` → contenu invisible, « écran vide » ;
 *   - avec `translateX: 28` → contenu décalé de 28 px à droite, hors marge.
 *
 * Toute valeur de départ différente de l'arrivée peut donc rester à l'écran :
 * le seul état de départ sûr est l'état final, autrement dit pas d'animation.
 * On garde le composant pour la lisibilité des écrans (il nomme l'intention) et
 * la `key`, qui force le remontage propre du contenu d'une étape à l'autre.
 */
export function StepTransition({
  stepKey,
  children,
}: {
  stepKey: string;
  children: ReactNode;
}): ReactNode {
  return <YStack key={stepKey}>{children}</YStack>;
}
