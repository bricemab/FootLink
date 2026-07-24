import { ClubStatus, Locale } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  canton?: string;

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
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  canton?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string;

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
