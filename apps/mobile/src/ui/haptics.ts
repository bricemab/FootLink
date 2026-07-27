/**
 * Retour haptique.
 *
 * Une action qui engage — publier une annonce, supprimer, envoyer une
 * invitation — doit se **sentir**, pas seulement s'afficher. C'est ce qui
 * sépare une app qu'on croit sur parole d'une app dont on sent qu'elle a agi.
 *
 * 🔴 **`expo-haptics` est chargé à l'appel, jamais en haut d'un module.** C'est
 * un module natif : sur un client de développement construit avant son ajout, un
 * import de premier niveau fait échouer TOUT le module qui l'importe — et si ce
 * module est un écran, l'application entière tombe
 * (`Cannot read property 'ErrorBoundary' of undefined`). Le piège s'est déjà payé
 * avec `expo-image-picker`.
 *
 * Tout échoue en silence : un téléphone sans moteur haptique, un émulateur, une
 * version d'app trop ancienne — aucun de ces cas n'est un problème à signaler.
 * Le retour haptique est un bonus, jamais une fonctionnalité dont dépend une
 * action.
 */

type HapticsModule = typeof import('expo-haptics');

let cached: HapticsModule | null | undefined;

async function load(): Promise<HapticsModule | null> {
  if (cached === undefined) {
    try {
      cached = await import('expo-haptics');
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Action accomplie : annonce publiée, entraîneur invité, profil enregistré. */
export function hapticSuccess(): void {
  void load().then((haptics) => {
    void haptics?.notificationAsync(haptics.NotificationFeedbackType.Success).catch(() => undefined);
  });
}

/** Action refusée ou échouée. Distinct du succès : la main doit les différencier. */
export function hapticError(): void {
  void load().then((haptics) => {
    void haptics?.notificationAsync(haptics.NotificationFeedbackType.Error).catch(() => undefined);
  });
}

/**
 * Geste franchi : un poste choisi sur le terrain, une bascule.
 *
 * ⚠️ **Léger, et sur les gestes seulement.** Un retour sur chaque appui devient
 * un bourdonnement permanent qu'on finit par couper dans les réglages système —
 * et on perd alors aussi les deux notifications ci-dessus, qui, elles, comptent.
 */
export function hapticTap(): void {
  void load().then((haptics) => {
    void haptics?.impactAsync(haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  });
}
