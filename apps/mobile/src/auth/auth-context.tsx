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
import type { AuthTokens, MeResponse } from '@/api/auth';
import { ApiError } from '@/api/client';
import { getGoogleIdToken, googleSignOut } from './google-sign-in';
import { clearTokens, loadTokens, saveTokens, type StoredTokens } from './token-storage';

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
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  // Les jetons vivent aussi en mémoire : évite un aller-retour SecureStore à
  // chaque requête, tout en restant la source de vérité côté stockage sécurisé.
  const tokens = useRef<StoredTokens | null>(null);

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
        const rotated = await authApi.refresh(current.refreshToken);
        await adopt(rotated);
        return call(rotated.accessToken);
      }
    },
    [adopt],
  );

  const reload = useCallback(async () => {
    try {
      const profile = await authed((accessToken) => authApi.me(accessToken));
      setUser(profile);
      setPhase('signedIn');
    } catch (error) {
      // Une panne réseau ne doit pas déconnecter : on garde la session et on
      // laissera l'écran proposer un « réessayer ».
      if (error instanceof ApiError && error.code === 'NETWORK') {
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
      try {
        await reload();
      } catch {
        // Hors ligne au lancement : on reste sur l'écran de chargement le temps
        // que l'utilisateur retente, plutôt que de le déconnecter à tort.
        if (!cancelled) {
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
    await adopt(await authApi.googleSignIn(idToken));
    await reload();
  }, [adopt, reload]);

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
