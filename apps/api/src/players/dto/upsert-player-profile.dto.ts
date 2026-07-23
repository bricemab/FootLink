import { CategoryCode, Gender, Poste, StrongFoot } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlayerPositionDto {
  @IsEnum(Poste)
  poste!: Poste;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpsertPlayerProfileDto {
  @IsString()
  @MaxLength(60)
  firstName!: string;

  @IsString()
  @MaxLength(60)
  lastName!: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear!: number;

  @IsEnum(Gender)
  gender!: Gender;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(230)
  heightCm?: number;

  @IsOptional()
  @IsEnum(StrongFoot)
  strongFoot?: StrongFoot;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsEnum(CategoryCode)
  currentCategory?: CategoryCode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentClubName?: string;

  @IsOptional()
  @IsBoolean()
  hideCurrentClub?: boolean;

  @IsOptional()
  @IsBoolean()
  isSeekingClub?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  canton?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string;

  // Position approximative envoyée par le client ; arrondie ~1 km avant stockage.
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PlayerPositionDto)
  positions!: PlayerPositionDto[];
}
