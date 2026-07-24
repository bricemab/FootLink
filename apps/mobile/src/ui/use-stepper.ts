import { useI18n } from '@/i18n';

/**
 * Libellés d'un stepper. Centralisé pour que les trois parcours d'inscription
 * annoncent leur progression exactement de la même façon.
 */
export function useStepper(
  labels: string[],
  current: number,
): { stepLabel: string; nextLabel: string } {
  const { t, fill } = useI18n();
  const stepLabel = fill(t.steps.progress, {
    current: String(current + 1),
    total: String(labels.length),
  });
  const upcoming = labels[current + 1];
  return {
    stepLabel,
    nextLabel: upcoming ? fill(t.steps.next, { label: upcoming }) : t.steps.last,
  };
}
