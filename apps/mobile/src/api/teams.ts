import type { CategoryCode, Gender } from '@footlink/shared';
import { apiRequest } from './client';
import type { Coach } from './coaches';

/**
 * Équipes du club.
 *
 * ⚠️ **Aucun `clubId` n'apparaît dans ce fichier, et ce n'est pas un oubli.** Le
 * club est toujours dérivé du token côté serveur (anti-IDOR, AGENTS §4bis) : un
 * identifiant de club envoyé d'ici serait au mieux ignoré, au pire une porte
 * d'entrée pour agir sur le club d'autrui.
 *
 * L'API renvoie **trois formes** selon l'endpoint : la liste et le détail sont
 * enrichis (entraîneurs assignés, nombre d'annonces), la création et la mise à
 * jour renvoient la ligne brute. On normalise ici plutôt que dans les écrans,
 * pour que le détail d'implémentation Prisma (`_count`, `coaches[].clubMember`)
 * ne remonte pas jusqu'à l'interface.
 */

/** Ligne d'équipe seule, telle que la renvoient la création et la mise à jour. */
export interface TeamRow {
  id: string;
  category: CategoryCode;
  gender: Gender;
  /** Distingue deux équipes d'une même catégorie (« Juniors B — 1 »). */
  name: string | null;
  createdAt: string;
}

/** Entraîneur vu depuis une équipe. L'identité est celle saisie par le club. */
export interface TeamCoach {
  clubMemberId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** Équipe telle qu'un écran en a besoin. */
export interface Team extends TeamRow {
  coaches: TeamCoach[];
  /** Annonces portées par l'équipe — ce que sa suppression détruirait. */
  listingCount: number;
}

/**
 * Ce qu'une suppression détruirait, en cascade.
 *
 * L'API **refuse** la suppression sans `confirm=true` et renvoie ce décompte :
 * l'app ne peut donc pas supprimer sans avoir de quoi prévenir la personne.
 */
export interface TeamDeletionImpact {
  teamId: string;
  teamName: string | null;
  listings: number;
  applications: number;
  clubInterests: number;
  matches: number;
  conversations: number;
  messages: number;
  coachAssignments: number;
  /** Vrai si la suppression ne détruit rien d'autre que l'équipe elle-même. */
  isEmpty: boolean;
}

/** Entraîneur créé et invité dans le même appel que l'équipe. */
export interface NewTeamCoach {
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateTeamInput {
  category: CategoryCode;
  gender?: Gender;
  name?: string;
  coach?: NewTeamCoach;
}

export type UpdateTeamInput = Partial<Pick<CreateTeamInput, 'category' | 'gender' | 'name'>>;

/** Forme brute de l'API pour la liste et le détail. Ne sort pas de ce fichier. */
interface TeamApi extends TeamRow {
  coaches: {
    clubMemberId: string;
    clubMember: {
      firstName: string | null;
      lastName: string | null;
      user: { email: string };
    };
  }[];
  _count: { listings: number };
}

function toTeam(raw: TeamApi): Team {
  return {
    id: raw.id,
    category: raw.category,
    gender: raw.gender,
    name: raw.name,
    createdAt: raw.createdAt,
    coaches: raw.coaches.map((assignment) => ({
      clubMemberId: assignment.clubMemberId,
      firstName: assignment.clubMember.firstName,
      lastName: assignment.clubMember.lastName,
      email: assignment.clubMember.user.email,
    })),
    listingCount: raw._count.listings,
  };
}

/**
 * Liste **filtrée par le serveur** selon le rôle : toutes les équipes du club
 * pour un CLUB_ADMIN, seulement les équipes assignées pour un COACH. L'app ne
 * filtre rien — c'est ce qui garantit qu'un entraîneur ne voit pas le reste.
 */
export async function listMyTeams(accessToken: string): Promise<Team[]> {
  const teams = await apiRequest<TeamApi[]>('/teams', { accessToken });
  return teams.map(toTeam);
}

export async function getTeam(accessToken: string, teamId: string): Promise<Team> {
  return toTeam(await apiRequest<TeamApi>(`/teams/${teamId}`, { accessToken }));
}

/**
 * Crée l'équipe, et optionnellement l'entraîneur qui la prend en charge — dans
 * la **même transaction** côté serveur, donc jamais d'équipe orpheline si
 * l'invitation est refusée.
 */
export function createTeam(
  accessToken: string,
  input: CreateTeamInput,
): Promise<{ team: TeamRow; coach: Coach | null }> {
  return apiRequest<{ team: TeamRow; coach: Coach | null }>('/teams', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function updateTeam(
  accessToken: string,
  teamId: string,
  input: UpdateTeamInput,
): Promise<TeamRow> {
  return apiRequest<TeamRow>(`/teams/${teamId}`, { method: 'PATCH', body: input, accessToken });
}

/** À lire AVANT de proposer la suppression : c'est le contenu de l'alerte. */
export function getTeamDeletionImpact(
  accessToken: string,
  teamId: string,
): Promise<TeamDeletionImpact> {
  return apiRequest<TeamDeletionImpact>(`/teams/${teamId}/deletion-impact`, { accessToken });
}

/**
 * Suppression en cascade. `confirm=true` n'est envoyé qu'après que la personne a
 * vu le décompte ; sans lui l'API répond 409
 * `TEAM_DELETION_CONFIRMATION_REQUIRED` avec ce décompte.
 */
export function deleteTeam(accessToken: string, teamId: string): Promise<void> {
  return apiRequest<void>(`/teams/${teamId}?confirm=true`, { method: 'DELETE', accessToken });
}
