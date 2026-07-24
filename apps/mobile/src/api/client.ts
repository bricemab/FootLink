import Constants from 'expo-constants';

/**
 * Client HTTP de l'API FootLink.
 *
 * En développement, l'URL est déduite de l'hôte du serveur Expo : sur un
 * téléphone réel, « localhost » désignerait le téléphone lui-même. On reprend
 * donc l'IP de la machine qui sert le bundle, et on remplace le port par celui
 * de l'API. Aucune configuration à faire pour lancer l'app sur un appareil.
 */
const API_PORT = 3000;
const API_PREFIX = '/api/v1';

export function resolveApiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) {
    return override.replace(/\/+$/, '');
  }
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${API_PORT}${API_PREFIX}`;
}

/** Codes métier renvoyés par l'API, utilisés pour router l'utilisateur. */
export type ApiErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'NETWORK'
  | 'UNKNOWN';

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

function toCode(raw: string | undefined): ApiErrorCode {
  return raw === 'EMAIL_NOT_VERIFIED' || raw === 'ACCOUNT_NOT_ACTIVE' ? raw : 'UNKNOWN';
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

  const text = await response.text();
  const payload: unknown = text.length === 0 ? undefined : JSON.parse(text);

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(response.status, toCode(errorBody.error?.code), extractDetail(errorBody));
  }

  return payload as T;
}
