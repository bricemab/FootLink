import { Locale } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

// Le club invite un entraîneur par email. Aucun mot de passe n'est choisi par le
// club : l'invité le définit lui-même via le jeton reçu (POST /auth/coach-invite/accept).
export class CreateCoachDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

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
