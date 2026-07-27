import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useAuth } from '@/auth/auth-context';

/**
 * Renvoie vers la garde de routage quand une session est déjà ouverte.
 *
 * 🔴 **Pourquoi ça ne suffit pas de faire `router.replace` après connexion.**
 * `replace` change l'écran courant, pas l'historique : `/login` restait dans la
 * pile, et le bouton retour d'Android y ramenait. On se retrouvait sur un
 * formulaire de connexion alors qu'on était connecté — Brice l'a constaté.
 * Une garde POSEE SUR L'ECRAN tient quel que soit le chemin emprunté : retour
 * matériel, geste, lien profond, restauration d'état après un redémarrage.
 *
 * ⚠️ **Elle ne s'applique PAS à tous les écrans d'authentification.**
 * `register/club` et `register/coach` s'utilisent justement AVEC une session
 * ouverte : l'identité vient d'abord, la demande de club ensuite (AGENTS §4bis),
 * et `index.tsx` y renvoie lui-même un CLUB_ADMIN sans club. Les y guarder
 * créerait une boucle de redirection.
 *
 * ⚠️ La condition reprend **exactement** celle de la première branche de
 * `index.tsx` (`phase === 'signedIn'` ET `user` présent). Une session à moitié
 * chargée y repart vers `/welcome` : si cette garde partait sur un critère plus
 * large, les deux se renverraient la balle indéfiniment.
 */
export function useSignedInRedirect(): ReactNode | null {
  const { phase, user } = useAuth();
  if (phase === 'signedIn' && user !== null) {
    return <Redirect href="/" />;
  }
  return null;
}
