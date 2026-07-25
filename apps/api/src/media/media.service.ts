import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';

/**
 * Médias (photos de profil, logos de club) sur stockage compatible S3.
 *
 * Le mobile téléverse **directement** vers le stockage via une URL pré-signée :
 * le backend ne relaie jamais les octets (AGENTS §2). Il ne fait que signer, et
 * vérifier après coup.
 *
 * Trois règles non négociables (HANDOFF 32), toutes appliquées ici :
 *
 * 1. **Le serveur génère la clé.** Le client ne choisit ni le chemin ni le nom
 *    du fichier. Sinon il pourrait écrire par-dessus le média d'autrui, ou
 *    faire pointer son avatar sur n'importe quel objet du bucket.
 * 2. **Le type est imposé à la signature.** L'URL pré-signée n'est valable que
 *    pour le `Content-Type` annoncé : téléverser autre chose échoue côté
 *    stockage, pas seulement dans nos contrôles.
 * 3. **La taille est vérifiée APRÈS le téléversement.** Une URL pré-signée ne
 *    peut pas plafonner la taille : on interroge donc l'objet et on le supprime
 *    s'il dépasse. Sans ça, le bucket serait un espace de stockage gratuit et
 *    illimité pour n'importe quel compte.
 *
 * Le bucket reste **privé** : les URL de lecture sont signées à la demande.
 * Plus coûteux qu'un domaine public, mais c'est le défaut sûr — des photos de
 * joueurs, dont des mineurs de 16-17 ans (LPD, cf. HANDOFF 34), n'ont pas à
 * être lisibles par quiconque devine une adresse.
 */

/** Seuls formats acceptés : ceux qu'un appareil photo produit, et rien d'exotique. */
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo : large pour une photo, étroit pour un abus
const UPLOAD_URL_TTL_SECONDS = 120; // le temps de téléverser, pas de partager
const READ_URL_TTL_SECONDS = 3600; // une heure : assez pour un écran, assez court pour ne pas fuiter

export interface UploadTicket {
  /** URL à laquelle le mobile fait son PUT, avec exactement le Content-Type annoncé. */
  uploadUrl: string;
  /** Clé générée par le serveur ; le client la renvoie telle quelle pour confirmer. */
  key: string;
  expiresIn: number;
  maxBytes: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('media.endpoint') ?? '';
    const accessKeyId = config.get<string>('media.accessKeyId') ?? '';
    const secretAccessKey = config.get<string>('media.secretAccessKey') ?? '';
    this.bucket = config.get<string>('media.bucket') ?? '';

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn('Media storage is not configured: uploads are disabled.');
      this.client = null;
      return;
    }

    this.client = new S3Client({
      region: config.get<string>('media.region') ?? 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** Billet de téléversement pour l'avatar d'une personne. */
  createAvatarUpload(userId: string, contentType: string): Promise<UploadTicket> {
    return this.createUpload('avatars', userId, contentType);
  }

  /** Billet de téléversement pour le logo d'un club. */
  createClubLogoUpload(clubId: string, contentType: string): Promise<UploadTicket> {
    return this.createUpload('club-logos', clubId, contentType);
  }

  /**
   * Billet de téléversement, pour un propriétaire donné.
   *
   * La clé est préfixée par le **type de média** puis par l'identifiant du
   * propriétaire : c'est ce qui permet de vérifier, à la confirmation, que la clé
   * rendue est bien la sienne. Un club et une personne ne peuvent donc pas se
   * marcher dessus, même si leurs identifiants se croisaient.
   */
  private async createUpload(
    prefix: string,
    ownerId: string,
    contentType: string,
  ): Promise<UploadTicket> {
    const extension = ALLOWED_CONTENT_TYPES[contentType];
    if (!extension) {
      throw new BadRequestException('Unsupported image type.');
    }
    const client = this.require();

    // Suffixe aléatoire : deux téléversements successifs ne s'écrasent pas, et
    // la clé n'est pas devinable depuis l'identifiant du propriétaire.
    const key = `${prefix}/${ownerId}/${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;

    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return { uploadUrl, key, expiresIn: UPLOAD_URL_TTL_SECONDS, maxBytes: MAX_BYTES };
  }

  confirmAvatarUpload(userId: string, key: string): Promise<void> {
    return this.confirmUpload('avatars', userId, key);
  }

  confirmClubLogoUpload(clubId: string, key: string): Promise<void> {
    return this.confirmUpload('club-logos', clubId, key);
  }

  /**
   * Valide une clé rendue par le client après téléversement.
   *
   * On ne croit rien : on vérifie que la clé appartient à ce propriétaire, que
   * l'objet existe vraiment, que son type est autorisé et que sa taille tient
   * dans la limite. Un objet trop gros est supprimé immédiatement.
   */
  private async confirmUpload(prefix: string, ownerId: string, key: string): Promise<void> {
    if (!key.startsWith(`${prefix}/${ownerId}/`)) {
      // Tentative de rattacher un objet qui n'est pas le sien.
      throw new BadRequestException('This upload does not belong to you.');
    }
    const client = this.require();

    let size: number | undefined;
    let type: string | undefined;
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      size = head.ContentLength;
      type = head.ContentType;
    } catch {
      throw new BadRequestException('Upload not found. Send the file before confirming.');
    }

    if (type === undefined || ALLOWED_CONTENT_TYPES[type] === undefined) {
      await this.delete(key);
      throw new BadRequestException('Unsupported image type.');
    }
    if (size === undefined || size > MAX_BYTES) {
      await this.delete(key);
      throw new BadRequestException('Image is too large.');
    }
  }

  /** URL de lecture signée, courte. `null` si l'utilisateur n'a pas de média. */
  async readUrl(key: string | null): Promise<string | null> {
    if (!key || !this.client) {
      return null;
    }
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: READ_URL_TTL_SECONDS,
    });
  }

  /** Suppression best-effort : sert au remplacement et au droit à l'effacement. */
  async delete(key: string | null): Promise<void> {
    if (!key || !this.client) {
      return;
    }
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // Un média orphelin est un désagrément, pas une raison de faire échouer
      // l'action de l'utilisateur.
      this.logger.warn(`Could not delete media ${key}: ${describe(error)}`);
    }
  }

  private require(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException('Media storage is not configured.');
    }
    return this.client;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
