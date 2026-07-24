import type { ReactNode } from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

/**
 * Jeu d'icônes de l'app.
 *
 * Aucun emoji dans FootLink : leur rendu change d'un appareil et d'une version
 * d'OS à l'autre, ils ignorent la palette de marque et sonnent amateur. Des
 * tracés vectoriels restent nets à toute densité et suivent la couleur qu'on
 * leur donne.
 */
const ACCENT = '#39FF88';
const DIM = 'rgba(169,196,184,0.9)';

export function BallIcon({ size = 26 }: { size?: number }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={ACCENT} strokeWidth="1.6" />
      <Polygon points="12,7.4 15.4,9.9 14.1,13.9 9.9,13.9 8.6,9.9" fill={ACCENT} />
      <Path
        d="M12 3v4.4M21 10.6l-5.6-0.7M18.4 20.2l-4.3-6.3M5.6 20.2l4.3-6.3M3 10.6l5.6-0.7"
        stroke={ACCENT}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Entraîneur : un sifflet. */
export function WhistleIcon({ size = 26 }: { size?: number }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13.5 8.5h5.2a2.3 2.3 0 0 1 0 4.6h-5.2"
        stroke={ACCENT}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <Circle cx="8.6" cy="10.8" r="5.1" stroke={ACCENT} strokeWidth="1.6" />
      <Circle cx="8.6" cy="10.8" r="1.7" fill={ACCENT} />
      <Path d="M12 5.4l2.6-2.2" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

/** Club : un écusson. */
export function CrestIcon({ size = 26 }: { size?: number }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.6l7.2 2.6v6.1c0 4.3-3 8.1-7.2 9.9-4.2-1.8-7.2-5.6-7.2-9.9V5.2z"
        stroke={ACCENT}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <Path d="M12 8.2v7.4M8.6 11.9h6.8" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color = ACCENT }: { size?: number; color?: string }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 12.5l5 5 10-11"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === 'down' ? 'M6 9.5l6 6 6-6' : 'M9.5 6l6 6-6 6'}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
