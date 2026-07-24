import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

/**
 * Design system FootLink.
 *
 * On part de la config v4 de Tamagui (thèmes clair/sombre, échelles d'espace et
 * de rayon, drivers d'animation) et on n'ajoute que ce qui fait l'identité :
 * une palette de marque exposée en tokens. Les tokens sont indépendants du
 * thème, donc utilisables partout sans dupliquer la définition des thèmes.
 *
 * Terrain de nuit + vert vif : lisible sur fond clair comme sombre.
 */
const brand = {
  // Fonds "terrain de nuit"
  night: '#07130F',
  nightSoft: '#0E241C',
  nightLift: '#14352A',
  // Accent
  pitch: '#1DBF73',
  pitchBright: '#39FF88',
  pitchDeep: '#0F7A4A',
  // Accent secondaire (moments forts : match, célébration)
  flare: '#FFB020',
  // Neutres de marque
  chalk: '#F4FBF7',
  chalkDim: '#A9C4B8',
  // États
  danger: '#FF5A5F',
} as const;

export const config = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    // On autorise les propriétés longues (backgroundColor) en plus des
    // raccourcis (bg) : moins piégeux à lire pour qui reprend le code.
    onlyAllowShorthands: false,
  },
  tokens: {
    ...defaultConfig.tokens,
    // La config v4 ne définit pas de groupe `color` (ses couleurs vivent dans
    // les thèmes) : on en crée un pour la marque. Tamagui résout `$brandPitch`
    // d'abord dans le thème courant, puis dans les tokens — ces couleurs sont
    // donc disponibles partout, quel que soit le thème.
    color: {
      brandNight: brand.night,
      brandNightSoft: brand.nightSoft,
      brandNightLift: brand.nightLift,
      brandPitch: brand.pitch,
      brandPitchBright: brand.pitchBright,
      brandPitchDeep: brand.pitchDeep,
      brandFlare: brand.flare,
      brandChalk: brand.chalk,
      brandChalkDim: brand.chalkDim,
      brandDanger: brand.danger,
    },
  },
});

export type AppTamaguiConfig = typeof config;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default config;
