import type { ReactNode } from 'react';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CheckIcon as PhCheck } from 'phosphor-react-native/src/icons/Check';
import { ShieldChevronIcon } from 'phosphor-react-native/src/icons/ShieldChevron';
import { SoccerBallIcon } from 'phosphor-react-native/src/icons/SoccerBall';
import { StrategyIcon } from 'phosphor-react-native/src/icons/Strategy';

/**
 * Icônes de l'app.
 *
 * Aucun emoji dans FootLink : leur rendu change d'un appareil et d'une version
 * d'OS à l'autre, ils ignorent la palette de marque et sonnent amateur.
 *
 * Jeu Phosphor, dessiné par des gens dont c'est le métier. Il s'appuie sur
 * `react-native-svg`, déjà présent : contrairement aux jeux à base de polices
 * (`@react-native-vector-icons`), il n'ajoute aucun module natif, donc aucune
 * reconstruction de l'app.
 *
 * Les imports passent par le sous-chemin `src/icons/<Nom>`, exposé
 * officiellement par le paquet. Importer depuis la racine tirerait les
 * **1512** icônes dans le bundle — Metro ne fait pas de tree-shaking — et
 * alourdirait le démarrage pour six pictogrammes.
 *
 * On passe par ces enveloppes plutôt que d'importer Phosphor partout : taille
 * et graisse restent décidées à un seul endroit, et changer de jeu d'icônes
 * plus tard ne toucherait que ce fichier.
 */
const ACCENT = '#39FF88';
const DIM = 'rgba(169,196,184,0.9)';

/** Joueur. */
export function BallIcon({ size = 28 }: { size?: number }): ReactNode {
  return <SoccerBallIcon size={size} color={ACCENT} weight="duotone" />;
}

/** Entraîneur : un tableau tactique, plus parlant qu'un sifflet. */
export function CoachIcon({ size = 28 }: { size?: number }): ReactNode {
  return <StrategyIcon size={size} color={ACCENT} weight="duotone" />;
}

/** Club : un écusson. */
export function CrestIcon({ size = 28 }: { size?: number }): ReactNode {
  return <ShieldChevronIcon size={size} color={ACCENT} weight="duotone" />;
}

export function CheckIcon({
  size = 18,
  color = ACCENT,
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <PhCheck size={size} color={color} weight="bold" />;
}

export function ChevronIcon({
  size = 18,
  direction = 'down',
  color = DIM,
}: {
  size?: number;
  direction?: 'down' | 'right';
  color?: string;
}): ReactNode {
  const Glyph = direction === 'down' ? CaretDownIcon : CaretRightIcon;
  return <Glyph size={size} color={color} weight="bold" />;
}
