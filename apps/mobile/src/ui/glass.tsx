import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Surfaces « verre » de l'application.
 *
 * **iOS 26 et plus : le vrai Liquid Glass d'Apple** (`expo-glass-effect`, qui
 * rend un `UIVisualEffectView` natif) — réfraction, brillance de bord et
 * réaction au contenu qui passe dessous. Ce n'est pas imitable en JS.
 *
 * **Ailleurs** (Android, iOS antérieur) : repli sur un flou `expo-blur`. C'est
 * honnêtement moins beau, et c'est assumé — Brice a tranché que le rendu Android
 * n'était pas la priorité.
 *
 * Deux garde-fous plutôt qu'un :
 *
 * - `isLiquidGlassAvailable()` dit que la plateforme le supporte ;
 * - `isGlassEffectAPIAvailable()` dit que l'API est réellement là **à
 *   l'exécution**. Certaines bêtas d'iOS 26 annoncent la première sans fournir
 *   la seconde, et `GlassView` y **plante** (expo#40911). On exige les deux.
 *
 * ⚠️ **Aucune animation sur ces surfaces.** L'émulateur rend en logiciel ; une
 * surface floutée animée en boucle recompose au CPU à chaque image, ce qui a
 * déjà valu un « FootLink isn't responding » (cf. HANDOFF).
 */
/*
 * Voile du repli, volontairement DENSE.
 *
 * Le flou d'Android est bien plus leger que celui d'iOS : a 0.55 on lisait le
 * bouton qui defilait derriere la barre, et les libelles des onglets devenaient
 * illisibles. Une barre de navigation qu'on ne lit pas est un defaut, pas un
 * parti pris esthetique. Le materiau natif d'Apple, lui, gere son propre
 * contraste et n'a pas besoin de ce voile.
 */
const TINT = 'rgba(7,19,15,0.45)';
const BORDER = 'rgba(57,255,136,0.16)';
/** Fond minimal garanti, meme sans aucun module natif de flou. */
const BASE = 'rgba(7,19,15,0.78)';

/**
 * Hauteur de la barre d'onglets, hors zone de securite.
 *
 * Exportee parce que DEUX endroits en dependent et doivent rester d'accord : le
 * layout qui la dessine, et `AppScreen` qui doit reserver la place en bas de
 * chaque ecran. Deux constantes separees finissent toujours par diverger, et le
 * symptome est du contenu qui passe sous les icones.
 */
export const TAB_BAR_HEIGHT = 68;

/** Vrai quand la plateforme rend le matériau natif d'Apple. */
export const liquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function GlassSurface({
  children,
  intensity = 28,
  /** Bordure lumineuse : en haut pour une barre d'onglets, en bas pour un en-tête. */
  edge = 'top',
}: {
  children: ReactNode;
  intensity?: number;
  edge?: 'top' | 'bottom' | 'none';
}): ReactNode {
  return (
    <View style={styles.container}>
      {/*
        🔴 Fond de base, TOUJOURS pose, sous le materiau.

        Sans lui la barre ne devait sa lisibilite qu'a un module natif : sur un
        client de developpement construit avant leur ajout, `GlassView` comme
        `BlurView` ne rendent RIEN, la barre devient totalement transparente et
        le contenu defile a nu par-dessus les icones. Une barre de navigation ne
        peut pas dependre d'un module optionnel pour exister.

        Assez opaque pour sauver ce cas, assez legere pour que le materiau
        d'Apple garde sa refraction par-dessus.
      */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BASE }]} />

      {liquidGlass ? (
        /*
          `regular` et non `clear` : sur un fond nocturne, le style clair laisse
          passer trop de contraste et les libellés de la barre deviennent
          illisibles dès qu'une carte claire défile dessous.

          Pas de `tintColor` vert : le matériau prend déjà la couleur de ce qui
          passe dessous, et le teinter écrase précisément ce qui fait l'effet.
        */
        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />
      ) : (
        <>
          <BlurView
            intensity={intensity}
            // `dark` explicitement : l'app est nocturne, laisser le système
            // décider donnerait une barre laiteuse en thème clair.
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          {/*
            Voile teinté par-dessus le flou. Sans lui, le flou seul éclaircit
            trop la barre et le texte perd son contraste — sur Android surtout,
            où l'implémentation est moins dense que sur iOS. Inutile avec le
            matériau natif, qui gère lui-même son contraste.
          */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT }]} />
        </>
      )}

      {edge !== 'none' ? (
        <View style={[styles.edge, edge === 'top' ? { top: 0 } : { bottom: 0 }]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Indispensable : sans lui le flou déborde des coins arrondis sur Android.
    overflow: 'hidden',
  },
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: BORDER,
  },
});
