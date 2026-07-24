import { Locale } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Identité saisie PAR LE CLUB au moment de l'invitation : le compte de
// l'entraîneur n'existe pas encore, il faut bien pouvoir l'appeler par son nom
// dans la liste des entraîneurs.
export class CoachIdentityDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName!: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

// Le club invite un entraîneur par email. Aucun mot de passe n'est choisi par le
// club : l'invité le définit lui-même via le jeton reçu (POST /auth/coach-invite/accept).
export class CreateCoachDto extends CoachIdentityDto {
  // Équipes assignées à la création. Vérifiées comme appartenant au club.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  teamIds?: string[];
}

// Remplace intégralement les assignations de l'entraîneur.
export class SetCoachTeamsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  teamIds!: string[];
}
