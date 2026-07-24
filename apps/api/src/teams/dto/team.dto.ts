import { CategoryCode, Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CoachIdentityDto } from '../../clubs/dto/coach.dto';

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

  // Entraîneur créé et invité en même temps que l'équipe. Optionnel : une
  // équipe peut exister avant qu'on sache qui l'entraîne.
  @IsOptional()
  @ValidateNested()
  @Type(() => CoachIdentityDto)
  coach?: CoachIdentityDto;
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

// Suppression d'équipe : destructive et en cascade, donc jamais implicite.
export class DeleteTeamQueryDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
