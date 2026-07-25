import { ListingStatus, Poste } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Nombre maximal de postes secondaires sur une annonce.
 *
 * Le champ est un `Json?` en base, donc sans borne naturelle. Sans limite, une
 * annonce « tous les postes » vide le matching de son sens : elle remonterait
 * pour chaque joueur, et le club recevrait des candidatures qu'il n'a pas
 * cherchées. Même plafond que les postes secondaires d'un joueur.
 */
export const MAX_SECONDARY_POSTES = 3;

/**
 * Création d'une annonce.
 *
 * Ni `clubId` ni `season` ici, et ce n'est pas un oubli :
 *
 * - le **club** se dérive du token (anti-IDOR, AGENTS §4bis) ;
 * - la **saison** se calcule (`getCurrentSeasonLabel`). La laisser au client
 *   ferait cohabiter des annonces de saisons incohérentes selon l'horloge du
 *   téléphone, et la saison sert au filtrage du feed.
 */
export class CreateListingDto {
  @IsString()
  @MaxLength(40)
  teamId!: string;

  @IsEnum(Poste)
  posteRecherche!: Poste;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SECONDARY_POSTES)
  @IsEnum(Poste, { each: true })
  secondaryPostes?: Poste[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /**
   * Date d'échéance. Passée, un ordonnanceur bascule l'annonce en `EXPIRED`.
   * Facultative : une annonce sans échéance reste ouverte jusqu'à sa clôture.
   */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /**
   * Publier tout de suite plutôt que de rester en brouillon.
   *
   * Par défaut une annonce naît en `DRAFT` : on l'écrit souvent en plusieurs
   * fois, et la rendre visible doit être un geste. Le `@default(ACTIVE)` du
   * schéma ne s'applique qu'aux écritures qui ne précisent rien.
   */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

/** Modification. L'équipe d'une annonce ne change pas : on en crée une autre. */
export class UpdateListingDto {
  @IsOptional()
  @IsEnum(Poste)
  posteRecherche?: Poste;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SECONDARY_POSTES)
  @IsEnum(Poste, { each: true })
  secondaryPostes?: Poste[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /**
   * Changement de statut demandé par le club.
   *
   * `EXPIRED` n'y figure pas : il est posé par l'ordonnanceur à partir de
   * `expiresAt`, jamais à la main. Laisser un client l'écrire créerait des
   * annonces expirées sans échéance, invisibles et inexplicables.
   */
  @IsOptional()
  // `@IsIn` et non `@IsEnum` : le `Exclude<>` de TypeScript n'existe pas a
  // l'execution, et `@IsEnum(ListingStatus)` acceptait donc `EXPIRED` — un
  // client pouvait poser lui-meme un statut reserve a l'ordonnanceur.
  @IsIn([ListingStatus.DRAFT, ListingStatus.ACTIVE, ListingStatus.CLOSED], {
    message: 'status must be DRAFT, ACTIVE or CLOSED',
  })
  status?: Exclude<ListingStatus, 'EXPIRED'>;
}

/** Suppression : destructive et en cascade, donc jamais implicite. */
export class DeleteListingQueryDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

/** Filtre de la liste, côté club. */
export class ListListingsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  teamId?: string;

  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}
