import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';

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
        <Text fontSize={12} fontWeight="700" letterSpacing={1.2} color="$brandPitchBright">
          {stepLabel.toUpperCase()}
        </Text>
        {nextLabel ? (
          <Text fontSize={12} color="$brandChalkDim" flexShrink={1} textAlign="right">
            {nextLabel}
          </Text>
        ) : null}
      </XStack>
    </YStack>
  );
}

/**
 * Transition entre deux étapes : l'entrante arrive de la droite.
 *
 * ⚠️ Pas d'`opacity: 0` au départ, volontairement. Une animation qui ne se joue
 * pas garde ses valeurs de départ : le contenu de l'étape restait alors
 * totalement invisible (« écran vide »). Un simple glissement ne peut pas faire
 * disparaître quoi que ce soit.
 */
export function StepTransition({
  stepKey,
  children,
}: {
  stepKey: string;
  children: ReactNode;
}): ReactNode {
  return (
    <MotiView
      key={stepKey}
      from={{ translateX: 28 }}
      animate={{ translateX: 0 }}
      transition={{ type: 'timing', duration: 280 }}
    >
      {children}
    </MotiView>
  );
}
