import { ClubStatus, Locale } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../auth/dto/auth.dto';

// Demande de compte club. Le demandeur est DÉJÀ authentifié : son identité est
// prouvée (email validé par code, ou Google) avant qu'on crée quoi que ce soit.
// Ni email ni mot de passe ici — ils viendraient du client, donc invérifiables.
export class RequestClubDto {
  @IsString()
  @MaxLength(120)
  clubName!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requestNote?: string;

  // Facultatif. `require_protocol: false` parce que personne ne tape « https:// »
  // à la main : « fcsion.ch » doit passer. Le préfixe est ajouté à l'écriture.
  @IsOptional()
  @IsUrl({ require_protocol: false, require_tld: true })
  @MaxLength(240)
  websiteUrl?: string;

  // Correction manuelle de l'association. Sans elle, le serveur la déduit du
  // canton du terrain. On l'accepte parce que la déduction n'est certaine que
  // pour les associations mono-cantonales (cf. CANTON_TO_REGION).
  @IsOptional()
  @IsString()
  @MaxLength(20)
  regionCode?: string;

  // --- Terrain du club -----------------------------------------------------
  // Le client n'envoie QUE le point et son libellé. `canton` et `locality` en
  // sont déduits par le serveur : les accepter du client reviendrait à laisser
  // un club se déclarer dans l'association de son choix.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  stadiumName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  // Repli quand la recherche d'adresse est indisponible : on garde au moins la
  // commune saisie à la main, quitte à ce que le canton reste vide.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: false, require_tld: true })
  @MaxLength(240)
  websiteUrl?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regionCode?: string;

  // Déplacer le terrain : mêmes règles qu'à la création. `canton` et `locality`
  // ne sont pas acceptés du client, ils sont recalculés depuis le point.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  stadiumName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;
}

export class ListClubsQueryDto {
  @IsOptional()
  @IsEnum(ClubStatus)
  status?: ClubStatus;
}

export class SearchClubsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
