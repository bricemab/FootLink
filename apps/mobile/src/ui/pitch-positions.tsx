import { POSTE_META, POSTES, posteLabel, type Poste } from '@footlink/shared';
import { MotiView } from 'moti';
import { useState, type ReactNode } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { hapticTap } from '@/ui/haptics';

/**
 * Choix des postes sur un demi-terrain.
 *
 * On pourrait poser une liste déroulante de dix entrées. On dessine un terrain
 * à la place, parce qu'un joueur ne pense pas « MILIEU_OFFENSIF » : il pense à
 * un endroit sur le gazon. Les coordonnées viennent de `POSTE_META`
 * (`packages/shared`), dérivé du champ `ligne` de la nomenclature — donc la
 * disposition suit la source de vérité, elle n'est pas dessinée au jugé.
 *
 * Un appui choisit le **poste principal** ; réappuyer sur un autre pastille le
 * met en **secondaire**. Le serveur exige exactement un principal et refuse les
 * doublons (`players.service.ts`), ce composant respecte donc la même règle.
 *
 * Les animations ici sont **déclenchées par l'appui** : elles partent de l'état
 * courant, donc rien ne peut rester figé si le moteur d'animation cale — voir
 * l'avertissement de `StepTransition`.
 */

const GRASS = '#0B2A1E';
const GRASS_DARK = '#081E16';
const LINE = 'rgba(244,251,247,0.22)';
const ACCENT = '#39FF88';

/**
 * Rapport hauteur/largeur du demi-terrain.
 *
 * Un demi-terrain réel est plus élancé (≈ 1,35), mais à cette hauteur le bouton
 * « Continuer » naissait sous le pli : l'action principale de l'étape demandait
 * un défilement pour exister. On resserre un peu le dessin plutôt que de faire
 * chercher le bouton.
 */
const RATIO = 1.15;

export interface PitchSelection {
  primary: Poste | null;
  secondary: Poste[];
}

export function PitchPositions({
  value,
  onChange,
  maxSecondary = 3,
  labels,
  readOnly = false,
}: {
  value: PitchSelection;
  onChange: (next: PitchSelection) => void;
  maxSecondary?: number;
  /**
   * Ce que la selection DESIGNE. Par defaut les postes d'un joueur ; une annonce
   * de club y met « poste cherche » et « postes acceptes aussi ». Meme geste,
   * sens different — d'ou un libelle injecte plutot que code en dur.
   */
  labels?: { primary: string; secondary: string };
  /**
   * Vrai = le terrain PRESENTE au lieu de saisir.
   *
   * Sans ca, les pastilles restaient pressables sur la fiche du joueur : elles
   * repondaient au toucher, declenchaient un retour haptique, et ne changeaient
   * rien. Un element qui a l'air actionnable et ne fait rien est un defaut, pas
   * une neutralite — il fait douter de tout le reste de l'ecran.
   */
  readOnly?: boolean;
}): ReactNode {
  const { t, locale } = useI18n();
  const [width, setWidth] = useState(0);
  const height = width * RATIO;

  const measure = (event: LayoutChangeEvent): void =>
    setWidth(event.nativeEvent.layout.width);

  /**
   * Un appui fait tourner le poste entre trois états : rien → principal →
   * secondaire → rien. Pas de mode à mémoriser, pas d'appui long à deviner : on
   * tape, on voit, on retape.
   */
  const cycle = (poste: Poste): void => {
    // Un poste qui s'allume est un geste franchi, pas un simple appui.
    hapticTap();
    if (value.primary === poste) {
      // Le principal devient secondaire, s'il reste de la place.
      const secondary =
        value.secondary.length < maxSecondary ? [...value.secondary, poste] : value.secondary;
      onChange({ primary: null, secondary });
      return;
    }
    if (value.secondary.includes(poste)) {
      onChange({ ...value, secondary: value.secondary.filter((p) => p !== poste) });
      return;
    }
    if (value.primary === null) {
      onChange({ ...value, primary: poste });
      return;
    }
    if (value.secondary.length < maxSecondary) {
      onChange({ ...value, secondary: [...value.secondary, poste] });
    }
  };

  const stateOf = (poste: Poste): 'primary' | 'secondary' | 'none' =>
    value.primary === poste ? 'primary' : value.secondary.includes(poste) ? 'secondary' : 'none';

  return (
    <YStack gap="$3">
      <YStack onLayout={measure} height={height} borderRadius={18} overflow="hidden">
        {width > 0 ? (
          <>
            {/* Le gazon et ses lignes : décoratif, non interactif. */}
            <Svg width="100%" height={height} style={{ position: 'absolute' }}>
              <Rect x="0" y="0" width="100%" height={height} fill={GRASS} />
              {/* Bandes de tonte, pour que ça ressemble à un terrain. */}
              {[0, 2, 4, 6].map((band) => (
                <Rect
                  key={band}
                  x="0"
                  y={(height / 8) * band}
                  width="100%"
                  height={height / 8}
                  fill={GRASS_DARK}
                />
              ))}
              {/*
                Sens de lecture : une feuille de composition. Le but défendu est
                en BAS, la ligne médiane en HAUT — comme les pastilles, dont le
                `y` de `POSTE_META` est inversé plus bas. Dessiner ces tracés en
                coordonnées SVG brutes (`y=0` en haut) mettait la surface autour
                de l'attaquant et le rond central autour du gardien.
              */}
              <Rect
                x={width * 0.22}
                y={height * 0.86}
                width={width * 0.56}
                height={height * 0.14}
                stroke={LINE}
                strokeWidth={1.5}
                fill="none"
              />
              <Rect
                x={width * 0.38}
                y={height * 0.94}
                width={width * 0.24}
                height={height * 0.06}
                stroke={LINE}
                strokeWidth={1.5}
                fill="none"
              />
              {/* Ligne médiane et rond central, au bord haut du cadre. */}
              <Line x1={0} y1={0} x2={width} y2={0} stroke={LINE} strokeWidth={1.5} />
              <Circle
                cx={width / 2}
                cy={0}
                r={width * 0.17}
                stroke={LINE}
                strokeWidth={1.5}
                fill="none"
              />
            </Svg>

            {/* Une pastille par poste, positionnée en pourcentage. */}
            {POSTES.map((poste) => {
              const meta = POSTE_META[poste];
              const state = stateOf(poste);
              const size = state === 'primary' ? 46 : 38;
              return (
                <Pressable
                  key={poste}
                  onPress={readOnly ? undefined : () => cycle(poste)}
                  // En presentation, la pastille est une IMAGE : pas de role de
                  // bouton annonce aux lecteurs d'ecran, pas de zone de touche
                  // elargie autour de quelque chose d'inerte.
                  accessibilityRole={readOnly ? 'image' : 'button'}
                  accessibilityLabel={posteLabel(poste, locale)}
                  accessibilityState={readOnly ? undefined : { selected: state !== 'none' }}
                  {...(readOnly ? {} : { hitSlop: 8 })}
                  style={{
                    position: 'absolute',
                    left: (width * meta.x) / 100 - size / 2,
                    // `y` va du but vers l'attaque : on inverse pour dessiner
                    // l'attaque en haut de l'image.
                    top: height - (height * meta.y) / 100 - size / 2,
                    width: size,
                    height: size,
                  }}
                >
                  <MotiView
                    animate={{
                      scale: state === 'primary' ? 1 : state === 'secondary' ? 0.92 : 0.84,
                      opacity: state === 'none' ? 0.55 : 1,
                    }}
                    transition={{ type: 'timing', duration: 140 }}
                    style={{
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: state === 'none' ? 1.5 : 2,
                      borderColor: state === 'none' ? 'rgba(244,251,247,0.35)' : ACCENT,
                      backgroundColor:
                        state === 'primary'
                          ? ACCENT
                          : state === 'secondary'
                            ? 'rgba(57,255,136,0.22)'
                            : 'rgba(7,19,15,0.72)',
                    }}
                  >
                    <Text
                      fontSize={state === 'primary' ? 13 : 12}
                      fontWeight="800"
                      color={state === 'primary' ? '$brandNight' : '$brandChalk'}
                    >
                      {shortCode(poste)}
                    </Text>
                  </MotiView>
                </Pressable>
              );
            })}
          </>
        ) : null}
      </YStack>

      {/* Ce que l'appui vient de produire, en mots — une pastille verte ne dit
          pas si le poste est principal ou secondaire. */}
      <YStack gap="$2">
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
            {(labels?.primary ?? t.onboarding.primaryPosition).toUpperCase()}
          </Text>
          <Text fontSize={15} fontWeight="700" color={value.primary ? '$brandPitchBright' : '$brandChalkDim'}>
            {value.primary ? posteLabel(value.primary, locale) : t.onboarding.tapThePitch}
          </Text>
        </XStack>

        {value.secondary.length > 0 ? (
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
              {(labels?.secondary ?? t.onboarding.otherPositions).toUpperCase()}
            </Text>
            <Text fontSize={14} color="$brandChalk" flexShrink={1}>
              {value.secondary.map((p) => posteLabel(p, locale)).join(' · ')}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </YStack>
  );
}

/**
 * Abréviation lisible dans une pastille de 40 px. Volontairement dérivée du
 * code, pas traduite : « GK » se comprend sur un terrain dans les deux langues,
 * et un libellé complet ne tiendrait pas.
 */
function shortCode(poste: Poste): string {
  const codes: Record<Poste, string> = {
    GARDIEN: 'GB',
    DEFENSEUR_CENTRAL: 'DC',
    DEFENSEUR_CENTRAL_DROIT: 'DCD',
    DEFENSEUR_CENTRAL_GAUCHE: 'DCG',
    LATERAL_DROIT: 'DD',
    LATERAL_GAUCHE: 'DG',
    // « MD » revient au milieu DROIT, comme dans l'usage courant. Le milieu
    // défensif prend donc « MDC », milieu défensif central — deux pastilles ne
    // peuvent pas porter la même abréviation sur le même terrain.
    MILIEU_DEFENSIF: 'MDC',
    MILIEU_CENTRAL: 'MC',
    MILIEU_DROIT: 'MD',
    MILIEU_GAUCHE: 'MG',
    MILIEU_OFFENSIF: 'MO',
    AILIER_DROIT: 'AD',
    AILIER_GAUCHE: 'AG',
    ATTAQUANT: 'AT',
  };
  return codes[poste];
}
