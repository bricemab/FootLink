import type { AppLocale } from '@footlink/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '@/api/auth';
import type { AuthTokens, MeResponse, ProfileHints } from '@/api/auth';
import { ApiError } from '@/api/client';
import { getGoogleIdToken, googleSignOut } from './google-sign-in';
import {
  clearTokens,
  loadProfile,
  loadTokens,
  saveProfile,
  saveTokens,
  type StoredTokens,
} from './token-storage';

type Phase = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  phase: Phase;
  /** Profil courant, relu en base à chaque appel : `emailVerified` est fiable. */
  user: MeResponse | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, locale: AppLocale) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** Google côté entraîneur : refusé (403) si aucun club n'a invité l'adresse. */
  signInWithGoogleAsCoach: () => Promise<void>;
  /** Google côté club : refusé (409) si l'adresse a déjà un compte. */
  signInWithGoogleAsClub: (locale: AppLocale) => Promise<void>;
  acceptCoachInvite: (email: string, code: string, password: string) => Promise<void>;
  /** Adopte une session émise par un endpoint hors module auth (demande de club). */
  adoptSession: (tokens: AuthTokens) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  reload: () => Promise<void>;
  /**
   * Exécute un appel authentifié en **rejouant après rotation** si le jeton
   * d'accès a expiré. Tout appel authentifié doit passer par ici.
   *
   * Sans lui, un écran qui lisait `loadTokens()` gardait un instantané du jeton
   * et cassait dès la fin de sa durée de vie — un onboarding entamé se voyait
   * refuser sa recherche d'adresse, puis sa sauvegarde, sans rien pour le dire.
   */
  authed: <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
  /**
   * Prénom et nom annoncés par Google à la dernière connexion, pour préremplir
   * l'onboarding. `undefined` par email, ou si Google n'en a pas fourni.
   *
   * Gardés **en mémoire seulement** : le serveur ne les stocke pas, donc ils
   * disparaissent au redémarrage de l'app. C'est assumé — l'onboarding suit la
   * connexion, et des champs vides valent mieux que des données personnelles
   * conservées sans raison.
   */
  profileHints?: ProfileHints;
  /** À appeler quand les indices ont servi, pour ne pas réécrire un champ corrigé. */
  clearProfileHints: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Le profil en cache a-t-il la forme attendue ?
 *
 * ⚠️ **Ce n'est pas de la paranoia.** Ce JSON a ete ecrit par la version de
 * l'app installee ce jour-la : apres une mise a jour, il peut lui manquer un
 * champ que les ecrans considerent comme acquis. On verifie donc ce dont
 * dependent le routage et le premier rendu, et on jette le reste plutot que de
 * faire planter le demarrage — le vrai profil arrive de toute facon une seconde
 * plus tard.
 */
function isProfile(value: unknown): value is MeResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<MeResponse>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.emailVerified === 'boolean'
  );
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  // Les jetons vivent aussi en mémoire : évite un aller-retour SecureStore à
  // chaque requête, tout en restant la source de vérité côté stockage sécurisé.
  const tokens = useRef<StoredTokens | null>(null);
  const [profileHints, setProfileHints] = useState<ProfileHints | undefined>();

  const forgetSession = useCallback(async () => {
    tokens.current = null;
    setUser(null);
    setPhase('signedOut');
    await clearTokens();
  }, []);

  const adopt = useCallback(async (issued: AuthTokens) => {
    // La copie en mémoire d'abord : même si l'écriture sécurisée échoue, la
    // session en cours reste utilisable (elle ne survivra juste pas au
    // redémarrage de l'app).
    tokens.current = { accessToken: issued.accessToken, refreshToken: issued.refreshToken };
    await saveTokens(issued).catch(() => undefined);
  }, []);

  /**
   * 🔴 **Rotation UNIQUE, partagée par tous les appels concurrents.**
   *
   * Sans ce verrou, deux requêtes qui prennent un 401 en même temps appellent
   * toutes les deux `refresh` avec le MÊME jeton. La première le rotate ; la
   * seconde rejoue un jeton désormais révoqué — et depuis le correctif #10 de
   * l'audit, rejouer un jeton rotaté **révoque toute la famille**. Resultat :
   * l'utilisateur est deconnecte de force, sans rien avoir fait de mal.
   *
   * Ce n'est pas theorique : `home.tsx` demande le profil et le club en
   * parallele (`Promise.all`), ce qui est exactement le cas qui declenche la
   * course.
   *
   * Tous les appelants attendent donc la meme promesse. `finally` la libere
   * qu'elle reussisse ou non — la garder apres un echec condamnerait la session
   * jusqu'au redemarrage.
   */
  // `StoredTokens` et non `AuthTokens` : seuls les deux jetons comptent ici, et
  // c'est le seul type que les deux branches ont en commun (celle qui rotate
  // renvoie la reponse de l'API, celle qui ne rotate pas ce qui est en memoire).
  const rotation = useRef<Promise<StoredTokens> | null>(null);

  const rotateOnce = useCallback(
    async (usedRefreshToken: string): Promise<StoredTokens> => {
      /*
       * Le jeton a peut-etre DEJA ete rotate pendant qu'on attendait : dans ce
       * cas il n'y a rien a renouveler, on repart de ce qui est en memoire.
       * Sans ce controle, un appel en file rejouerait l'ancien jeton et
       * declencherait precisement la revocation qu'on cherche a eviter.
       */
      const fresh = tokens.current;
      if (fresh && fresh.refreshToken !== usedRefreshToken) {
        return fresh;
      }
      if (!rotation.current) {
        rotation.current = authApi
          .refresh(usedRefreshToken)
          .then(async (rotated) => {
            await adopt(rotated);
            return rotated;
          })
          .finally(() => {
            rotation.current = null;
          });
      }
      return rotation.current;
    },
    [adopt],
  );

  /**
   * Exécute un appel authentifié. Sur 401, tente une rotation du refresh token
   * puis rejoue une seule fois : au-delà, la session est réellement morte.
   */
  const authed = useCallback(
    async <T,>(call: (accessToken: string) => Promise<T>): Promise<T> => {
      const current = tokens.current;
      if (!current) {
        throw new ApiError(401, 'UNKNOWN', 'No session');
      }
      try {
        return await call(current.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
        const rotated = await rotateOnce(current.refreshToken);
        return call(rotated.accessToken);
      }
    },
    [rotateOnce],
  );

  /**
   * Relit le profil.
   *
   * 🔴 **Une seule chose doit deconnecter : un refus d'authentification
   * DEFINITIF.** N'importe quelle autre erreur laissait la session sur le
   * carreau — un 500 passager, une coupure a mi-requete, un serveur qui
   * redemarre. La regle est desormais explicite : on ne se deconnecte que sur
   * un 401 qui a survecu a la rotation, c'est-a-dire quand le refresh lui-meme
   * a ete refuse. Tout le reste se retente.
   *
   * Le profil est mis en cache a chaque succes : c'est lui qui permet de
   * demarrer hors ligne sans renvoyer personne a l'ecran de connexion.
   */
  const reload = useCallback(async () => {
    try {
      const profile = await authed((accessToken) => authApi.me(accessToken));
      setUser(profile);
      setPhase('signedIn');
      await saveProfile(profile);
    } catch (error) {
      const definitive = error instanceof ApiError && error.status === 401;
      if (!definitive) {
        throw error;
      }
      await forgetSession();
    }
  }, [authed, forgetSession]);

  // Restauration de session au démarrage.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadTokens();
      if (cancelled) {
        return;
      }
      if (!stored) {
        setPhase('signedOut');
        return;
      }
      tokens.current = stored;

      /*
        🔴 **On entre AVANT d'avoir parle au serveur.** Le profil en cache suffit
        a ouvrir l'app : le lancement devient instantane, et surtout une panne
        reseau ne renvoie plus personne a l'ecran de connexion. La verite
        arrive juste apres, par `reload()`.

        ⚠️ Le cache vient d'une version peut-etre plus ancienne de l'app : on
        verifie donc la forme minimale avant de s'en servir, sinon un champ
        ajoute depuis ferait planter le premier ecran.
      */
      const cached = await loadProfile();
      if (!cancelled && isProfile(cached)) {
        setUser(cached);
        setPhase('signedIn');
      }

      try {
        await reload();
      } catch {
        /*
          Injoignable. Avec un profil en cache on reste dedans — c'est tout
          l'interet. Sans cache (premiere ouverture apres installation, hors
          ligne), on ne peut rien afficher : l'ecran de connexion est alors la
          seule chose honnete, et les jetons restent en place pour la prochaine
          tentative.
        */
        if (!cancelled && !isProfile(cached)) {
          setPhase('signedOut');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Volontairement au montage uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await adopt(await authApi.login(email.trim().toLowerCase(), password));
      await reload();
    },
    [adopt, reload],
  );

  const signUp = useCallback(
    async (email: string, password: string, locale: AppLocale) => {
      await adopt(await authApi.register(email.trim().toLowerCase(), password, locale));
      await reload();
    },
    [adopt, reload],
  );

  const signInWithGoogle = useCallback(async () => {
    // Le jeton ID est renvoyé tel quel au serveur, qui en revérifie signature
    // et audience. L'app ne décode rien et ne fait confiance à rien.
    const idToken = await getGoogleIdToken();
    const issued = await authApi.googleSignIn(idToken);
    await adopt(issued);
    setProfileHints(issued.profileHints);
    await reload();
  }, [adopt, reload]);

  const clearProfileHints = useCallback(() => setProfileHints(undefined), []);

  /**
   * Entrée entraîneur par Google : le serveur exige une invitation de club et
   * n'écrit rien s'il n'en trouve pas. En cas de refus, aucune session n'a été
   * créée — il n'y a donc rien à déconnecter côté FootLink, seulement la session
   * Google native à relâcher pour que l'utilisateur puisse choisir une autre
   * adresse au clic suivant.
   */
  const signInWithGoogleAsCoach = useCallback(async () => {
    const idToken = await getGoogleIdToken();
    try {
      await adopt(await authApi.googleCoachSignIn(idToken));
    } catch (error) {
      await googleSignOut().catch(() => undefined);
      throw error;
    }
    await reload();
  }, [adopt, reload]);

  /**
   * Entrée club par Google : le serveur ne crée un compte que si l'adresse est
   * libre. Refus (409) = aucune session créée ; on relâche la session Google
   * native pour que l'utilisateur puisse en choisir une autre.
   */
  const signInWithGoogleAsClub = useCallback(
    async (locale: AppLocale) => {
      const idToken = await getGoogleIdToken();
      try {
        await adopt(await authApi.googleClubSignIn(idToken, locale));
      } catch (error) {
        await googleSignOut().catch(() => undefined);
        throw error;
      }
      await reload();
    },
    [adopt, reload],
  );

  const acceptCoachInvite = useCallback(
    async (email: string, code: string, password: string) => {
      await adopt(await authApi.acceptCoachInvite(email, code, password));
      await reload();
    },
    [adopt, reload],
  );

  const adoptSession = useCallback(
    async (issued: AuthTokens) => {
      await adopt(issued);
      await reload();
    },
    [adopt, reload],
  );

  const signOut = useCallback(async () => {
    const current = tokens.current;
    if (current) {
      // Best effort : si le serveur ne répond pas, la session locale part quand même.
      await authApi.logout(current.refreshToken, current.accessToken).catch(() => undefined);
    }
    // Sinon Google reconnecte silencieusement le même compte au clic suivant.
    // `catch` obligatoire : sans lui, un échec côté Google empêchait
    // `forgetSession()` de tourner, et l'utilisateur restait connecté
    // localement après avoir demandé sa déconnexion.
    await googleSignOut().catch(() => undefined);
    await forgetSession();
  }, [forgetSession]);

  const verifyEmail = useCallback(
    async (token: string) => {
      await authApi.verifyEmail(token.trim());
      await reload();
    },
    [reload],
  );

  const resendVerification = useCallback(async () => {
    await authed((accessToken) => authApi.resendVerification(accessToken));
  }, [authed]);

  const value = useMemo<AuthValue>(
    () => ({
      phase,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleAsCoach,
      signInWithGoogleAsClub,
      acceptCoachInvite,
      adoptSession,
      signOut,
      verifyEmail,
      resendVerification,
      reload,
      authed,
      ...(profileHints ? { profileHints } : {}),
      clearProfileHints,
    }),
    [
      phase,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleAsCoach,
      signInWithGoogleAsClub,
      acceptCoachInvite,
      adoptSession,
      signOut,
      verifyEmail,
      resendVerification,
      reload,
      authed,
      profileHints,
      clearProfileHints,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  }
  return value;
}
