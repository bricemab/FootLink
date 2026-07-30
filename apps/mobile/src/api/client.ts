import Constants from 'expo-constants';

/**
 * Client HTTP de l'API FootLink.
 *
 * Trois sources, dans cet ordre :
 *
 * 1. `EXPO_PUBLIC_API_URL` — surcharge explicite, injectée au build.
 * 2. `extra.apiUrl` d'`app.json` — l'URL de production, versionnée.
 * 3. En développement seulement, l'hôte du serveur Expo. Sur un appareil réel,
 *    « localhost » désigne le téléphone lui-même : on reprend donc l'IP de la
 *    machine qui sert le bundle, et on remplace le port par celui de l'API.
 *    Rien à configurer pour lancer l'app sur un téléphone ou un émulateur.
 *
 * Et si rien ne convient, on échoue bruyamment. Un build de production n'a pas
 * de serveur Expo : retomber silencieusement sur `localhost` donnerait une app
 * publiée sur les stores qui n'atteint aucune API, avec pour seul symptôme un
 * « serveur injoignable » incompréhensible.
 */
const DEV_API_PORT = 3000;
const API_PREFIX = '/api/v1';

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

export function resolveApiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) {
    return trimTrailingSlashes(override);
  }

  const configured = Constants.expoConfig?.extra?.apiUrl;
  if (typeof configured === 'string' && configured.length > 0) {
    return trimTrailingSlashes(configured);
  }

  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
    const host = hostUri?.split(':')[0];
    return `http://${host ?? 'localhost'}:${DEV_API_PORT}${API_PREFIX}`;
  }

  throw new Error(
    "URL de l'API introuvable : définis EXPO_PUBLIC_API_URL au build, ou extra.apiUrl dans app.json.",
  );
}

/**
 * Codes métier renvoyés par l'API, utilisés pour router l'utilisateur.
 *
 * ⚠️ **Une seule liste, et le type en DECOULE.** Il y avait une union de types
 * et un tableau de chaines a tenir en phase a la main : ajouter un code d'un
 * cote seulement le faisait silencieusement retomber en `UNKNOWN`, donc sur
 * « Quelque chose s'est mal passe ». Le type derive du tableau : oublier n'est
 * plus possible.
 */
const KNOWN_CODES = [
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_NOT_ACTIVE',
  'EMAIL_ALREADY_USED',
  'ACCOUNT_IS_GOOGLE',
  'INVALID_CREDENTIALS',
  'COACH_NOT_INVITED',
  'CLUB_ALREADY_LINKED',
  'COACH_INVITE_INVALID',
  'COACH_INVITE_LOCKED',
  'SIGNUP_CODE_INVALID',
  'SIGNUP_CODE_LOCKED',
  'TEAM_DELETION_CONFIRMATION_REQUIRED',
  'COACH_INVITE_RATE_LIMITED',
  'ALREADY_APPLIED',
  'MATCH_EXISTS',
] as const;

/** `NETWORK` et `UNKNOWN` ne viennent pas du serveur : c'est l'app qui les pose. */
export type ApiErrorCode = (typeof KNOWN_CODES)[number] | 'NETWORK' | 'UNKNOWN';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Message technique renvoyé par l'API (anglais), utile en debug. */
  readonly detail: string | undefined;

  constructor(status: number, code: ApiErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string | string[];
  };
}

function extractDetail(body: ApiErrorBody): string | undefined {
  const message = body.error?.message;
  if (Array.isArray(message)) {
    return message[0];
  }
  return message;
}

/**
 * Le code brut du serveur, ramene a ceux qu'on connait.
 *
 * `KNOWN_CODES` etant `as const`, son `includes` n'accepte plus n'importe quelle
 * chaine : on elargit donc le tableau LOCALEMENT, le temps du test. C'est le
 * seul endroit ou l'on quitte le typage — et c'est normal, c'est la frontiere
 * entre du JSON venu du reseau et nos types.
 */
function toCode(raw: string | undefined): ApiErrorCode {
  const known: readonly string[] = KNOWN_CODES;
  return raw !== undefined && known.includes(raw) ? (raw as ApiErrorCode) : 'UNKNOWN';
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | undefined;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch {
    // Réseau injoignable : cas très fréquent en dev (pare-feu, mauvais Wi-Fi).
    throw new ApiError(0, 'NETWORK');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // Attention : NestJS répond 200 avec un corps VIDE quand un contrôleur
  // retourne `null`. Un « pas de ressource » arrive donc ici en `undefined`,
  // pas en `null` — aux fonctions d'appel de normaliser (cf. api/clubs.ts).
  const text = await response.text();
  const payload: unknown = text.length === 0 ? undefined : JSON.parse(text);

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(response.status, toCode(errorBody.error?.code), extractDetail(errorBody));
  }

  return payload as T;
}
