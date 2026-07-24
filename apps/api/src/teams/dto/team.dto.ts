import { CategoryCode, Gender } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// Le clubId n'apparaît nulle part : il est TOUJOURS dérivé du token (anti-IDOR).
export class CreateTeamDto {
  @IsEnum(CategoryCode)
  category!: CategoryCode;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  // Distingue deux équipes d'une même catégorie (ex. « Juniors B — 1 »).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsEnum(CategoryCode)
  category?: CategoryCode;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}
