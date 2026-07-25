import type { Poste } from '@footlink/shared';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { PitchPositions, type PitchSelection } from '@/ui/pitch-positions';
import { TextField } from '@/ui/text-field';

/**
 * Corps commun à la création et à la modification d'une annonce.
 *
 * Le terrain interactif est **le même composant** que l'onboarding joueur : un
 * club ne pense pas « MILIEU_OFFENSIF » plus qu'un joueur, il pense à un endroit
 * sur le gazon. La sémantique change, pas le geste — ici le poste principal est
 * le **poste cherché**, et les secondaires les postes **acceptés aussi**.
 *
 * ⚠️ Le plafond de postes secondaires est celui du serveur
 * (`MAX_SECONDARY_POSTES`). Le dépasser côté app donnerait un 400 incompréhensible.
 */
export function ListingForm({
  positions,
  onPositionsChange,
  description,
  onDescriptionChange,
  maxSecondary,
}: {
  positions: PitchSelection;
  onPositionsChange: (next: PitchSelection) => void;
  description: string;
  onDescriptionChange: (next: string) => void;
  maxSecondary: number;
}): ReactNode {
  const { t } = useI18n();

  return (
    <YStack gap="$4">
      <PitchPositions
        value={positions}
        onChange={onPositionsChange}
        maxSecondary={maxSecondary}
        labels={{ primary: t.listings.mainPoste, secondary: t.listings.otherPostes }}
      />

      <TextField
        label={t.listings.description}
        value={description}
        onChangeText={onDescriptionChange}
        placeholder={t.listings.descriptionPlaceholder}
        multiline
      />
    </YStack>
  );
}

/** Les postes d'une sélection, prêts pour l'API. */
export function toPostes(positions: PitchSelection): {
  posteRecherche: Poste;
  secondaryPostes: Poste[];
} | null {
  if (positions.primary === null) {
    return null;
  }
  return { posteRecherche: positions.primary, secondaryPostes: positions.secondary };
}
