// Miroirs des enums Prisma pour usage PARTAGÉ (le mobile ne peut pas importer
// @prisma/client). Source de vérité = apps/api/prisma/schema.prisma.
// À garder synchronisé (un codegen depuis le schéma est prévu en durcissement).

export const POSTES = [
  'GARDIEN',
  'DEFENSEUR_CENTRAL',
  'DEFENSEUR_CENTRAL_DROIT',
  'DEFENSEUR_CENTRAL_GAUCHE',
  'LATERAL_DROIT',
  'LATERAL_GAUCHE',
  'MILIEU_DEFENSIF',
  'MILIEU_CENTRAL',
  'MILIEU_DROIT',
  'MILIEU_GAUCHE',
  'MILIEU_OFFENSIF',
  'AILIER_DROIT',
  'AILIER_GAUCHE',
  'ATTAQUANT',
] as const;
export type Poste = (typeof POSTES)[number];

/**
 * Statuts d'un club. Mêmes codes que l'enum Prisma `ClubStatus`.
 *
 * Recopiés ici parce que le mobile ne lit pas le schéma : sans ça, l'union était
 * réécrite à la main dans chaque fichier qui en a besoin, donc divergeait.
 */
export const CLUB_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];

export const CATEGORY_CODES = [
  'PREMIERE_LIGUE',
  'DEUXIEME_LIGUE_INTER',
  'DEUXIEME_LIGUE',
  'TROISIEME_LIGUE',
  'QUATRIEME_LIGUE',
  'CINQUIEME_LIGUE',
  'JUNIORS_A',
  'JUNIORS_B',
  'JUNIORS_C',
  'JUNIORS_D',
  'JUNIORS_E',
  'JUNIORS_F',
  'JUNIORS_G',
  'SENIORS_30',
  'SENIORS_40',
  'SENIORS_50',
  'PREMIERE_LIGUE_F',
  'DEUXIEME_LIGUE_F',
  'TROISIEME_LIGUE_F',
  'QUATRIEME_LIGUE_F',
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export const LOCALES = ['FR', 'DE', 'IT'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const STRONG_FEET = ['DROIT', 'GAUCHE', 'AMBIDEXTRE'] as const;
export type StrongFoot = (typeof STRONG_FEET)[number];

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

export const USER_ROLES = ['PLAYER', 'CLUB_ADMIN', 'COACH', 'SUPER_ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
