import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useI18n } from '@/i18n';
import { PitchBackdrop, useInsideChrome } from '@/ui/pitch-backdrop';

/**
 * Enveloppe des écrans d'application : titre, retour, défilement.
 *
 * Distincte d'`AuthFormShell`, qui centre son contenu et évite le clavier —
 * deux comportements faux pour une liste, où le contenu part du haut et peut
 * dépasser l'écran.
 *
 * ⚠️ **Aucune animation d'entrée ici non plus.** Sur ce stack, une animation
 * d'entrée ne se joue pas toujours et ses valeurs de départ persistent alors à
 * l'écran : `opacity: 0` rend le contenu invisible, un `translate` le laisse
 * décalé. Voir le commentaire de `StepTransition`.
 */
export function AppScreen({
  title,
  subtitle,
  action,
  onBack,
  allowStackBack = true,
  onRefresh,
  refreshing = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Zone à droite du titre : bouton d'ajout, compteur… */
  action?: ReactNode;
  /** Remplace le retour de navigation. Absent = retour de pile s'il en existe. */
  onBack?: () => void;
  /**
   * Faux = aucun retour, meme si la pile en a un.
   *
   * A mettre sur un ecran RACINE : un onglet est atteint par la barre du bas, et
   * la pile garde pourtant un historique -- l'ecran affichait donc un "Retour"
   * qui ne menait nulle part de sensé.
   */
  allowStackBack?: boolean;
  /** Fourni = tirer pour rafraîchir. Une liste distante doit pouvoir être relue. */
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const showBack = onBack !== undefined || (allowStackBack && router.canGoBack());

  /*
   * Respiration en bas de page.
   *
   * 🔴 **`insets.bottom` ne s'ajoute PAS sous une barre d'onglets.** La barre
   * descend jusqu'au bord de l'ecran et reserve elle-meme la barre de gestes ;
   * l'ajouter ici la comptait une seconde fois, et creusait un trou de deux
   * zones de securite entre le dernier bouton et les icones. Il ne reste qu'a
   * eviter que le contenu ne colle a la barre.
   *
   * Hors habillage (l'accueil), la zone de securite est bien reelle et
   * personne d'autre ne la porte : on la remet.
   */
  const bottomInset = useInsideChrome() ? 16 : insets.bottom + 24;

  return (
    <PitchBackdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomInset }}
        showsVerticalScrollIndicator={false}
        {...(onRefresh
          ? {
              refreshControl: (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#39FF88"
                  colors={['#39FF88']}
                />
              ),
            }
          : {})}
      >
        <YStack gap="$4">
          {showBack ? (
            <Pressable onPress={onBack ?? (() => router.back())} accessibilityRole="button">
              <Text fontSize={15} color="$brandChalkDim">
                ← {t.common.back}
              </Text>
            </Pressable>
          ) : null}

          <XStack alignItems="flex-start" justifyContent="space-between" gap="$3">
            <YStack gap="$1.5" flexShrink={1}>
              <Text
                fontSize={30}
                lineHeight={35}
                fontWeight="800"
                color="$brandChalk"
                letterSpacing={-0.6}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text fontSize={15} lineHeight={21} color="$brandChalkDim">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            {action}
          </XStack>

          <YStack gap="$3">{children}</YStack>
        </YStack>
      </ScrollView>
    </PitchBackdrop>
  );
}

/**
 * Carte de contenu.
 *
 * 🔴 **Une carte doit vouloir dire quelque chose.** Tout était enfermé dans le
 * même rectangle — bordure, rayon et fond identiques pour une liste, un bloc
 * d'informations et un bouton. Empilés, ces cadres se neutralisent : rien ne
 * ressort, et l'œil ne sait plus par où commencer. Brice l'a dit : « des carrés
 * sous des carrés ».
 *
 * Trois registres désormais, et un seul cadre visible :
 *
 * - `card` — un ELEMENT, souvent tapable. Il mérite son cadre.
 * - `hero` — l'élément principal de l'écran. Halo vert et liseré accentué : il
 *   n'y en a qu'UN par écran, sinon plus rien n'est principal.
 * - `plain` — de l'information. Pas de cadre du tout : c'est l'espacement et la
 *   typographie qui regroupent, pas une boîte de plus.
 */
export function Card({
  children,
  onPress,
  accent = false,
  variant = 'card',
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Vrai = liseré vert, pour l'élément qui porte l'action principale. */
  accent?: boolean;
  variant?: 'card' | 'hero' | 'plain';
}): ReactNode {
  const hero = variant === 'hero';
  const plain = variant === 'plain';

  const body = plain ? (
    <YStack gap="$2.5" paddingVertical="$1">
      {children}
    </YStack>
  ) : (
    <YStack
      gap="$2.5"
      padding={hero ? '$4.5' : '$4'}
      borderRadius={hero ? 24 : 18}
      backgroundColor={hero ? 'rgba(16,44,33,0.92)' : 'rgba(12,30,23,0.88)'}
      borderWidth={1.5}
      borderColor={
        hero || accent ? 'rgba(57,255,136,0.38)' : 'rgba(244,251,247,0.12)'
      }
      {...(hero
        ? {
            // Halo porté : c'est ce qui detache l'element principal du fond au
            // lieu de le poser dessus comme les autres.
            shadowColor: '#39FF88',
            shadowOpacity: 0.18,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }
        : {})}
    >
      {children}
    </YStack>
  );

  if (!onPress) {
    return body;
  }
  /*
   * Retour au toucher : opacite ET echelle. Il part de l'etat courant, donc
   * rien ne peut rester fige — contrairement a une animation d'entree (cf.
   * `Appear`). 0.97 se sent sous le doigt sans deplacer ce qui l'entoure.
   */
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <YStack opacity={pressed ? 0.8 : 1} scale={pressed ? 0.97 : 1}>
          {body}
        </YStack>
      )}
    </Pressable>
  );
}

/**
 * Titre de section, hors de toute boîte.
 *
 * C'est lui qui remplace un cadre quand il ne s'agit que de regrouper : un
 * intitulé et de l'espace suffisent à dire « ces lignes vont ensemble », sans
 * ajouter un rectangle de plus à l'empilement.
 */
export function SectionTitle({ children }: { children: string }): ReactNode {
  return (
    <Text
      fontSize={12.5}
      fontWeight="700"
      letterSpacing={1}
      color="$brandChalkDim"
      marginTop="$2"
    >
      {children.toUpperCase()}
    </Text>
  );
}

/** Étiquette d'état : « en attente », « actif »… */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'warning';
}): ReactNode {
  // `as const` volontaire : sans lui les trois entrées s'unifient en `string`,
  // que Tamagui refuse — il attend soit un jeton de thème, soit une couleur.
  const palette = {
    neutral: {
      bg: 'rgba(244,251,247,0.10)',
      border: 'rgba(244,251,247,0.22)',
      fg: '$brandChalkDim',
    },
    accent: {
      bg: 'rgba(57,255,136,0.14)',
      border: 'rgba(57,255,136,0.38)',
      fg: '$brandPitchBright',
    },
    warning: { bg: 'rgba(255,176,32,0.14)', border: 'rgba(255,176,32,0.40)', fg: '#FFC14D' },
  } as const;
  const tones = palette[tone];

  return (
    <XStack
      paddingHorizontal="$2.5"
      paddingVertical="$1"
      borderRadius={999}
      backgroundColor={tones.bg}
      borderWidth={1}
      borderColor={tones.border}
    >
      <Text fontSize={11.5} fontWeight="700" letterSpacing={0.5} color={tones.fg}>
        {label.toUpperCase()}
      </Text>
    </XStack>
  );
}

/**
 * Absence de contenu.
 *
 * 🔴 **Un état vide doit inviter, pas constater.** C'était une simple boîte de
 * texte : le lecteur apprenait qu'il n'y avait rien, et l'écran s'arrêtait là.
 * Un dessin donne une forme à ce qui manque, et `action` offre le geste qui
 * remplit le vide — sans quoi la seule issue est le retour arrière.
 *
 * Le terrain vide n'est pas décoratif : c'est le motif de l'app, et il dit
 * « ici viendront des joueurs » mieux qu'une phrase.
 */
export function EmptyState({
  text,
  action,
}: {
  text: string;
  /** Le geste qui remplit ce vide. Absent quand l'écran n'en propose aucun. */
  action?: ReactNode;
}): ReactNode {
  return (
    <YStack
      padding="$5"
      gap="$3.5"
      borderRadius={18}
      borderWidth={1}
      borderColor="rgba(244,251,247,0.10)"
      backgroundColor="rgba(12,30,23,0.55)"
      alignItems="center"
    >
      <EmptyPitch />
      <Text fontSize={14.5} lineHeight={21} color="$brandChalkDim" textAlign="center">
        {text}
      </Text>
      {action}
    </YStack>
  );
}

/**
 * Un demi-terrain vide, au trait.
 *
 * Volontairement le MÊME tracé que `PitchPositions` — surface, point de
 * réparation, rond central — pour que l'absence et la présence parlent la même
 * langue. Un dessin générique aurait fait illustration plaquée.
 */
function EmptyPitch(): ReactNode {
  return (
    <Svg width={86} height={64} viewBox="0 0 86 64" fill="none" opacity={0.55}>
      <Rect
        x={1}
        y={1}
        width={84}
        height={62}
        rx={6}
        stroke="rgba(57,255,136,0.30)"
        strokeWidth={1.5}
      />
      <Line x1={1} y1={32} x2={85} y2={32} stroke="rgba(244,251,247,0.20)" strokeWidth={1.2} />
      <Circle cx={43} cy={32} r={9} stroke="rgba(244,251,247,0.20)" strokeWidth={1.2} />
      <Rect
        x={26}
        y={1}
        width={34}
        height={13}
        stroke="rgba(244,251,247,0.20)"
        strokeWidth={1.2}
      />
      <Rect
        x={26}
        y={50}
        width={34}
        height={13}
        stroke="rgba(244,251,247,0.20)"
        strokeWidth={1.2}
      />
    </Svg>
  );
}
