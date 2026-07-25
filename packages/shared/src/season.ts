import { CategoryCode, Gender } from './enums';

// ============================================================
//  Saison & catégories d'âge (football suisse)
//  Règle critique : la correspondance année de naissance -> catégorie change
//  CHAQUE saison. On ne code JAMAIS une année en dur ; tout est calculé ici.
// ============================================================

export const MIN_PLAYER_AGE = 16; // MVP : réservé aux 16 ans et plus

// Saison suisse ~1er août -> 31 juillet. "2026/2027" démarre en 2026.
export function getSeasonStartYear(date: Date): number {
  // Mois 0-11 ; août = 7.
  return date.getUTCMonth() >= 7 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export function getSeasonLabel(seasonStartYear: number): string {
  return `${seasonStartYear}/${seasonStartYear + 1}`;
}

export function getCurrentSeasonLabel(date: Date): string {
  return getSeasonLabel(getSeasonStartYear(date));
}

// Âge de référence = année de début de saison - année de naissance.
export function playerAgeForSeason(birthYear: number, seasonStartYear: number): number {
  return seasonStartYear - birthYear;
}

// MVP : autorisé si >= 16 ans (AGENTS §6.4 : birthYear <= saison - 16).
export function isAgeAllowed(birthYear: number, seasonStartYear: number): boolean {
  return playerAgeForSeason(birthYear, seasonStartYear) >= MIN_PLAYER_AGE;
}

// Mineur légal : 16-17 ans au MVP (isMinor conservé pour d'éventuelles règles LPD).
export function isMinorForSeason(birthYear: number, seasonStartYear: number): boolean {
  const age = playerAgeForSeason(birthYear, seasonStartYear);
  return age >= MIN_PLAYER_AGE && age < 18;
}

// Bande junior par âge. NB : à confirmer avec les prescriptions AVF avant
// d'ouvrir les catégories mineures (< 16) ; sert surtout au matching/validation.
export function getJuniorCategory(birthYear: number, seasonStartYear: number): CategoryCode | null {
  const age = playerAgeForSeason(birthYear, seasonStartYear);
  if (age >= 18 && age <= 19) return 'JUNIORS_A';
  if (age >= 16 && age <= 17) return 'JUNIORS_B';
  if (age >= 14 && age <= 15) return 'JUNIORS_C';
  if (age >= 12 && age <= 13) return 'JUNIORS_D';
  if (age >= 10 && age <= 11) return 'JUNIORS_E';
  if (age >= 8 && age <= 9) return 'JUNIORS_F';
  if (age >= 4 && age <= 7) return 'JUNIORS_G';
  return null; // adulte -> actifs
}

const ACTIVE_MALE: readonly CategoryCode[] = [
  'PREMIERE_LIGUE',
  'DEUXIEME_LIGUE_INTER',
  'DEUXIEME_LIGUE',
  'TROISIEME_LIGUE',
  'QUATRIEME_LIGUE',
  'CINQUIEME_LIGUE',
];
const ACTIVE_FEMALE: readonly CategoryCode[] = [
  'PREMIERE_LIGUE_F',
  'DEUXIEME_LIGUE_F',
  'TROISIEME_LIGUE_F',
  'QUATRIEME_LIGUE_F',
];

const JUNIOR_CATEGORIES: readonly CategoryCode[] = [
  'JUNIORS_A',
  'JUNIORS_B',
  'JUNIORS_C',
  'JUNIORS_D',
  'JUNIORS_E',
  'JUNIORS_F',
  'JUNIORS_G',
];

/**
 * Catégories qu'un **club** peut engager, pour un genre donné.
 *
 * À ne pas confondre avec `getEligibleCategories`, qui répond à une autre
 * question : ce qu'un **joueur** d'une année de naissance donnée peut jouer.
 * Ici il n'y a aucune année en jeu — un club choisit ce qu'il engage.
 *
 * L'ordre est celui de la lecture : actifs du plus haut au plus bas, puis
 * juniors du plus âgé au plus jeune, puis seniors.
 */
export function categoriesForTeamGender(gender: Gender): CategoryCode[] {
  const actives = gender === 'FEMALE' ? ACTIVE_FEMALE : ACTIVE_MALE;
  const seniors: readonly CategoryCode[] =
    gender === 'FEMALE' ? [] : ['SENIORS_30', 'SENIORS_40', 'SENIORS_50'];
  return [...actives, ...JUNIOR_CATEGORIES, ...seniors];
}

// Catégories éligibles pour le matching (raffiné en Phase 6).
// Un Juniors A et un adulte peuvent jouer chez les actifs ; seniors selon l'âge.
export function getEligibleCategories(
  birthYear: number,
  seasonStartYear: number,
  gender: Gender,
): CategoryCode[] {
  const age = playerAgeForSeason(birthYear, seasonStartYear);
  const actives = gender === 'FEMALE' ? ACTIVE_FEMALE : ACTIVE_MALE;
  const junior = getJuniorCategory(birthYear, seasonStartYear);
  const result = new Set<CategoryCode>();

  if (junior) {
    result.add(junior);
    if (junior === 'JUNIORS_A') {
      actives.forEach((c) => result.add(c));
    }
  } else {
    actives.forEach((c) => result.add(c));
    if (gender === 'MALE') {
      if (age >= 30) result.add('SENIORS_30');
      if (age >= 40) result.add('SENIORS_40');
      if (age >= 50) result.add('SENIORS_50');
    }
  }
  return [...result];
}
