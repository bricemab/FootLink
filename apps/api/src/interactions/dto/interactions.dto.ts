import { PlayerInterestKind } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Filtre de `GET /interactions/mine`.
 *
 * Absent = les deux, dans l'ordre chronologique inverse. L'ecran s'en sert pour
 * ses deux sections, mais un appel sans filtre reste utile : c'est lui qui
 * alimentera le badge « tu as 3 annonces en attente ».
 *
 * `@IsEnum` sur l'enum Prisma et non une union de chaines : la source de verite
 * des valeurs est le schema, ici comme partout.
 */
export class MyInterestsQueryDto {
  @IsOptional()
  @IsEnum(PlayerInterestKind)
  kind?: PlayerInterestKind;
}
