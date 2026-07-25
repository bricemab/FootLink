import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest } from './client';

/**
 * Logo du club, sur le stockage R2.
 *
 * Trois temps, comme pour l'avatar : le serveur émet un billet, le mobile
 * téléverse **directement** vers le stockage, puis confirme. Le backend ne
 * relaie jamais les octets, et surtout : c'est **lui** qui génère la clé. Si le
 * client la fournissait, il pourrait faire pointer le logo de son club sur
 * n'importe quel objet du bucket.
 */

export interface UploadTicket {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

export function createClubLogoUpload(
  accessToken: string,
  contentType: string,
): Promise<UploadTicket> {
  return apiRequest<UploadTicket>('/clubs/me/logo/upload-url', {
    method: 'POST',
    body: { contentType },
    accessToken,
  });
}

export function confirmClubLogo(
  accessToken: string,
  key: string,
): Promise<{ logoUrl: string | null }> {
  return apiRequest<{ logoUrl: string | null }>('/clubs/me/logo/confirm', {
    method: 'POST',
    body: { key },
    accessToken,
  });
}

export function removeClubLogo(accessToken: string): Promise<void> {
  return apiRequest<void>('/clubs/me/logo', { method: 'DELETE', accessToken });
}

/**
 * Téléverse le fichier vers le stockage, hors de notre API.
 *
 * `Content-Type` doit être **exactement** celui annoncé au serveur : l'URL
 * pré-signée n'est valable que pour lui, donc envoyer autre chose échoue côté
 * stockage — et pas seulement dans nos contrôles.
 *
 * Pas d'en-tête d'autorisation ici : la signature EST l'autorisation, et joindre
 * notre jeton reviendrait à l'envoyer à un tiers.
 *
 * ⚠️ **Passe par `expo-file-system` et non par `fetch`.** `fetch(fileUri)` suivi
 * de `.blob()` semble marcher mais ne lit pas fiablement une URI `file://` en
 * React Native, et le corps `Blob` d'un PUT y est mal supporté : le fichier part
 * vide ou pas du tout, et le stockage répond 200 sur un objet de 0 octet — donc
 * un échec silencieux. `uploadAsync` en `BINARY_CONTENT` envoie les octets bruts
 * du fichier, ce qui est exactement ce qu'attend une URL pré-signée.
 */
export async function putToStorage(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  });
  // Le stockage renvoie 200 ou 204 selon l'implémentation.
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Storage refused the upload (${result.status}).`);
  }
}
