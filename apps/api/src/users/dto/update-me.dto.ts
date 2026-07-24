import { Locale } from '@prisma/client';
import { IsEnum } from 'class-validator';

// Seule la langue est modifiable ici. L'email et le rôle ont leurs propres
// parcours (validation, invitation) : les exposer sur un PATCH générique
// ouvrirait la porte au mass-assignment.
export class UpdateMyLocaleDto {
  @IsEnum(Locale)
  locale!: Locale;
}
