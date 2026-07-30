import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { YStack } from 'tamagui';
import { useAuth } from '@/auth/auth-context';

/**
 * Garde de routage unique.
 *
 * L'ordre reflète la règle serveur : sans email validé, l'API refuse tout —
 * l'app envoie donc l'utilisateur sur l'écran de validation avant tout le reste
 * plutôt que de le laisser se heurter à des 403.
 */
export default function Index(): ReactNode {
  const { phase, user } = useAuth();

  useEffect(() => {
    if (phase !== 'loading') {
      void SplashScreen.hideAsync();
    }
  }, [phase]);

  if (phase === 'loading') {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$brandNight">
        <ActivityIndicator color="#39FF88" />
      </YStack>
    );
  }

  if (phase === 'signedOut' || !user) {
    return <Redirect href="/welcome" />;
  }

  if (!user.emailVerified) {
    // Même route que le lien profond de l'email (footlink://auth/verify-email).
    return <Redirect href="/auth/verify-email" />;
  }

  // Un CLUB_ADMIN sans club a été authentifié mais n'a pas envoyé sa demande :
  // il reprend son formulaire. À vérifier AVANT l'onboarding joueur — on ne
  // demande ni âge ni poste à quelqu'un qui inscrit un club, et le rôle est posé
  // dès la création du compte pour que cette distinction existe.
  if (user.role === 'CLUB_ADMIN' && user.clubStatus === null) {
    return <Redirect href="/register/club" />;
  }

  // Un joueur sans profil n'a rien à faire dans le feed : sans poste ni
  // localisation, le matching n'aurait rien pour filtrer. `hasPlayerProfile`
  // est relu en base à chaque `/auth/me`, donc la garde se lève dès la première
  // sauvegarde. Ne concerne QUE les joueurs : un club ou un entraîneur n'a pas
  // de PlayerProfile et ne doit pas être envoyé ici.
  if (user.role === 'PLAYER' && !user.hasPlayerProfile) {
    return <Redirect href="/onboarding/player" />;
  }

  /*
    🔴 **L'ENTRAINEUR va dans l'espace club, pas dans l'espace joueur.**

    Il tombait dans `/player` par defaut, faute de branche a son nom. Sans
    `PlayerProfile`, le feed le refusait et lui affichait « Complete ton profil
    joueur pour decouvrir des clubs » : quelqu'un que son club vient d'inviter
    ouvrait l'app et on lui demandait son poste et son annee de naissance. Une
    impasse, atteinte des la premiere seconde d'usage.

    Le meme espace que le responsable de club, mais reduit : l'API filtre deja
    equipes et annonces sur ses affectations (`listMyTeams`, `listMine`), et
    l'onglet de configuration lui est retire. Deux espaces separes auraient
    duplique trois ecrans pour la meme chose.
  */
  if (user.role === 'CLUB_ADMIN' || user.role === 'COACH') {
    return <Redirect href="/club" />;
  }

  return <Redirect href="/player" />;
}
