import type { ReactNode } from 'react';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { EyeIcon as PhEye } from 'phosphor-react-native/src/icons/Eye';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CheckIcon as PhCheck } from 'phosphor-react-native/src/icons/Check';
import { MegaphoneIcon as PhMegaphone } from 'phosphor-react-native/src/icons/Megaphone';
import { SoccerBallIcon } from 'phosphor-react-native/src/icons/SoccerBall';
import { StrategyIcon } from 'phosphor-react-native/src/icons/Strategy';
import { UsersThreeIcon } from 'phosphor-react-native/src/icons/UsersThree';
import { WarningIcon as PhWarning } from 'phosphor-react-native/src/icons/Warning';
import Svg, { Path } from 'react-native-svg';

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

/**
 * Joueur.
 *
 * `color` réglable : la barre d'onglets doit pouvoir éteindre l'icône inactive,
 * sinon les quatre onglets ont l'air actifs en permanence.
 */
export function BallIcon({
  size = 28,
  color = ACCENT,
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <SoccerBallIcon size={size} color={color} weight="duotone" />;
}

/** Entraîneur : un tableau tactique, plus parlant qu'un sifflet. */
export function CoachIcon({
  size = 28,
  color = ACCENT,
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <StrategyIcon size={size} color={color} weight="duotone" />;
}

/** Équipes : un groupe, à distinguer du ballon qui désigne un joueur seul. */
export function TeamsIcon({
  size = 28,
  color = ACCENT,
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <UsersThreeIcon size={size} color={color} weight="duotone" />;
}

/**
 * Annonces : un porte-voix.
 *
 * Pas une feuille ni un dossier : une annonce n'est pas un document qu'on
 * range, c'est un appel qu'on lance à des joueurs qu'on ne connaît pas encore.
 */
export function MegaphoneIcon({
  size = 28,
  color = ACCENT,
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <PhMegaphone size={size} color={color} weight="duotone" />;
}

/** Aperçu : ce que verront les autres. */
export function EyeIcon({
  size = 28,
  color = ACCENT,
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <PhEye size={size} color={color} weight="duotone" />;
}

/**
 * Club : un stade.
 *
 * Phosphor n'a pas de stade. Plutôt que d'ajouter une seconde librairie de
 * ~5900 icônes pour un seul pictogramme, le tracé est repris de Tabler Icons
 * (MIT, https://tabler.io/icons/icon/building-stadium) et intégré ici. Trait de
 * 2 px et extrémités arrondies, pour rester dans la même famille visuelle que
 * les icônes Phosphor voisines.
 */
export function StadiumIcon({ size = 28, color = ACCENT }: { size?: number; color?: string }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12a8 2 0 1 0 16 0a8 2 0 1 0 -16 0M4 12v7c0 .94 2.51 1.785 6 2v-3h4v3c3.435 -.225 6 -1.07 6 -2v-7M15 6h4v-3h-4v7M7 6h4v-3h-4v7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
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

/** Alerte : signale une erreur de formulaire. Rouge par défaut. */
export function WarningIcon({
  size = 18,
  color = '#FF5A5F',
}: {
  size?: number;
  color?: string;
}): ReactNode {
  return <PhWarning size={size} color={color} weight="fill" />;
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
