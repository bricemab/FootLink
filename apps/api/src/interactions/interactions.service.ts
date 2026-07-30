import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryCode, Gender, Poste } from '@footlink/shared';
import {
  ClubMemberRole,
  ListingStatus,
  NotificationType,
  PlayerInterestKind,
  Prisma,
} from '@prisma/client';
import { FeedService } from '../feed/feed.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';

/**
 * Distance a vol d'oiseau, en kilometres.
 *
 * Recopiee du feed plutot qu'importee : le feed en fait un usage SQL, sur des
 * milliers de lignes ; ici on a deja les deux points. Extraire un module partage
 * pour six lignes de trigonometrie couterait plus qu'il ne rapporte — mais si
 * une troisieme copie apparait, c'est le signal qu'il faut le faire.
 */
const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Une annonce sur laquelle le joueur s'est deja prononce.
 *
 * ⚠️ **Pas de `matchKind` ici, et c'est voulu.** Le feed propose et doit se
 * justifier ; cet ecran-ci liste des decisions DEJA prises. Afficher « cherche
 * ton poste » sur une candidature envoyee reviendrait a re-argumenter un choix
 * que la personne a fait elle-meme.
 *
 * `status` en revanche est indispensable : un club peut avoir ferme l'annonce
 * apres coup, et laisser croire qu'une candidature court toujours serait
 * malhonnete.
 */
export interface InterestListing {
  id: string;
  kind: PlayerInterestKind;
  /** Quand le joueur s'est prononce — pas la date de l'annonce. */
  decidedAt: string;
  posteRecherche: Poste;
  secondaryPostes: Poste[];
  description: string | null;
  season: string;
  status: ListingStatus;
  team: { id: string; name: string | null; category: CategoryCode; gender: Gender };
  club: { id: string; name: string; locality: string | null; canton: string | null };
  distanceKm: number;
  /** Vrai quand le club a repondu : il y a un `Match`. */
  matched: boolean;
}

/**
 * Les interactions : le seul endroit ou un geste devient un engagement.
 *
 * 🔴 **Trois issues, et une seule engage.**
 *
 * - `APPLIED` — une candidature. Le club est notifie. C'est public.
 * - `SAVED` — un signet prive. **Personne n'est notifie, jamais.** C'est ce qui
 *   manquait : sans lui, chaque carte forcait soit un engagement premature,
 *   soit une perte definitive.
 * - le rejet (`ListingDismissal`, cote feed) — rien n'est dit a personne.
 *
 * ⚠️ **Un `SAVED` ne declenche RIEN**, en particulier aucun `Match`. C'est une
 * decision arretee (cf. CLAUDE.md), et c'est elle qui rend le systeme lisible :
 * un seul geste engage, et on sait lequel. Si `SAVED` comptait comme un interet,
 * un joueur qui met de cote « pour y reflechir » se retrouverait en
 * conversation avec un club sans l'avoir voulu.
 *
 * 🔐 **Chaque methode revalide l'acces.** Aucun identifiant venu du client n'est
 * cru : la garde de visibilite est celle du feed (`assertListingOpenToPlayer`),
 * jamais une copie — une garde dupliquee est une garde qui divergera.
 */
@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: FeedService,
    private readonly teams: TeamsService,
  ) {}

  // --- Cote joueur ---------------------------------------------------------

  /**
   * Postuler.
   *
   * Idempotent : repostuler ne cree pas de doublon et ne renotifie pas le club.
   * Un joueur qui appuie deux fois ne doit pas apparaitre deux fois dans la
   * boite du club.
   *
   * Une annonce ENREGISTREE devient une candidature : c'est le chemin normal —
   * on garde, on compare, on postule.
   */
  async apply(userId: string, listingId: string): Promise<{ matched: boolean }> {
    const { playerId } = await this.feed.assertListingOpenToPlayer(userId, listingId);

    const existing = await this.prisma.playerInterest.findUnique({
      where: { playerId_listingId: { playerId, listingId } },
    });
    if (existing?.kind === PlayerInterestKind.APPLIED) {
      // Deja postule : on ne renotifie pas, mais on renvoie l'etat courant du
      // match, sinon l'app croirait que rien ne s'est passe.
      const match = await this.prisma.match.findUnique({
        where: { listingId_playerId: { listingId, playerId } },
        select: { id: true },
      });
      return { matched: match !== null };
    }

    await this.prisma.playerInterest.upsert({
      where: { playerId_listingId: { playerId, listingId } },
      update: { kind: PlayerInterestKind.APPLIED },
      create: { playerId, listingId, kind: PlayerInterestKind.APPLIED },
    });

    /*
      Postuler efface un rejet precedent. Sans ca, une annonce ecartee puis
      retrouvee autrement resterait invisible du joueur qui vient pourtant d'y
      postuler — deux verites contradictoires sur la meme annonce.
    */
    await this.prisma.listingDismissal.deleteMany({ where: { playerId, listingId } });

    await this.notifyClub(listingId, playerId, NotificationType.APPLICATION);
    const matched = await this.createMatchIfMutual(listingId, playerId);
    return { matched };
  }

  /**
   * Enregistrer : un signet prive.
   *
   * ⚠️ **Refuse de retrograder une candidature.** Enregistrer par-dessus un
   * `APPLIED` reviendrait a retirer une candidature que le club a deja recue,
   * sans que le joueur ait demande a la retirer. Retirer est un geste distinct,
   * explicite, avec son propre bouton.
   */
  async save(userId: string, listingId: string): Promise<void> {
    const { playerId } = await this.feed.assertListingOpenToPlayer(userId, listingId);

    const existing = await this.prisma.playerInterest.findUnique({
      where: { playerId_listingId: { playerId, listingId } },
    });
    if (existing?.kind === PlayerInterestKind.APPLIED) {
      throw new ConflictException({
        code: 'ALREADY_APPLIED',
        message: 'Withdraw your application before saving this listing.',
      });
    }

    await this.prisma.playerInterest.upsert({
      where: { playerId_listingId: { playerId, listingId } },
      update: { kind: PlayerInterestKind.SAVED },
      create: { playerId, listingId, kind: PlayerInterestKind.SAVED },
    });
    await this.prisma.listingDismissal.deleteMany({ where: { playerId, listingId } });
  }

  /**
   * Retirer sa candidature, ou son signet.
   *
   * ⚠️ **Impossible des qu'un `Match` existe.** Une conversation peut etre
   * ouverte en face ; la faire disparaitre du cote du club sans un mot serait
   * brutal, et laisserait un `Match` sans l'interet qui l'a produit. Le geste
   * qui convient alors est le blocage ou le signalement, pas un retrait
   * silencieux.
   *
   * ⚠️ **Ne recree pas de rejet.** Retirer n'est pas refuser : l'annonce
   * redevient simplement proposable.
   */
  async remove(userId: string, listingId: string): Promise<void> {
    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!player) {
      throw new NotFoundException('Interest not found.');
    }
    const interest = await this.prisma.playerInterest.findUnique({
      where: { playerId_listingId: { playerId: player.id, listingId } },
    });
    if (!interest) {
      throw new NotFoundException('Interest not found.');
    }

    const match = await this.prisma.match.findUnique({
      where: { listingId_playerId: { listingId, playerId: player.id } },
      select: { id: true },
    });
    if (match) {
      throw new ConflictException({
        code: 'MATCH_EXISTS',
        message: 'This application already produced a match.',
      });
    }

    await this.prisma.playerInterest.delete({ where: { id: interest.id } });
  }

  /**
   * Ce que le joueur a envoye, et ce qu'il a garde.
   *
   * 🔴 **Sans cet ecran, `SAVED` serait une ecriture sans lecture** — on met de
   * cote et on ne retrouve rien, puisque le feed exclut deja tout ce sur quoi on
   * s'est prononce. C'est le defaut le plus courant de ce genre de
   * fonctionnalite, et le plus decevant a l'usage.
   *
   * Aucune garde de visibilite ici : ce sont SES decisions. Une annonce fermee
   * ou expiree entre-temps reste listee, avec son statut — la masquer effacerait
   * une candidature de sa propre memoire.
   */
  async mine(userId: string, kind?: PlayerInterestKind): Promise<InterestListing[]> {
    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true, lat: true, lng: true },
    });
    if (!player) {
      return [];
    }

    const interests = await this.prisma.playerInterest.findMany({
      where: { playerId: player.id, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { listing: { include: { team: { include: { club: true } } } } },
    });
    if (interests.length === 0) {
      return [];
    }

    const matches = await this.prisma.match.findMany({
      where: { playerId: player.id, listingId: { in: interests.map((i) => i.listingId) } },
      select: { listingId: true },
    });
    const matched = new Set(matches.map((m) => m.listingId));

    return interests.map((interest) => {
      const { listing } = interest;
      const club = listing.team.club;
      const distanceKm =
        player.lat !== null && player.lng !== null && club.lat !== null && club.lng !== null
          ? Math.round(
              haversineKm(
                Number(player.lat),
                Number(player.lng),
                Number(club.lat),
                Number(club.lng),
              ),
            )
          : 0;

      return {
        id: listing.id,
        kind: interest.kind,
        decidedAt: interest.createdAt.toISOString(),
        posteRecherche: listing.posteRecherche as Poste,
        secondaryPostes: parsePostes(listing.secondaryPostes),
        description: listing.description,
        season: listing.season,
        status: listing.status,
        team: {
          id: listing.team.id,
          name: listing.team.name,
          category: listing.team.category as CategoryCode,
          gender: listing.team.gender as Gender,
        },
        club: {
          id: club.id,
          name: club.name,
          locality: club.locality,
          canton: club.canton,
        },
        distanceKm,
        matched: matched.has(listing.id),
      };
    });
  }

  // --- Cote club -----------------------------------------------------------

  /**
   * Le club manifeste son interet pour un joueur.
   *
   * ⚠️ **Sans reciprocite.** Le joueur est notifie, et c'est tout : il reste
   * libre de ne pas repondre. Un « like » de club qui ouvrirait d'office une
   * conversation mettrait la pression sur la partie la plus faible du rapport.
   *
   * La garde est celle des equipes (`assertTeamAccess`) : club approuve, et un
   * entraineur cantonne aux equipes qui lui sont assignees.
   */
  async clubLike(userId: string, listingId: string, playerId: string): Promise<{ matched: boolean }> {
    const listing = await this.assertListingOfMyTeam(userId, listingId);

    /*
      Le joueur doit etre atteignable : visible, en recherche, et sans blocage
      dans un sens ni dans l'autre. On reutilise la fiche publique, qui porte
      deja ces trois gardes et repond 404 sans dire laquelle a refuse.
    */
    await this.feed.publicPlayer(userId, playerId);

    await this.prisma.clubInterest.upsert({
      where: { listingId_playerId: { listingId, playerId } },
      update: {},
      create: { listingId, playerId },
    });

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
    if (player) {
      await this.prisma.notification.create({
        data: {
          userId: player.userId,
          type: NotificationType.CLUB_INTEREST,
          data: { listingId, clubId: listing.team.clubId },
        },
      });
    }

    const matched = await this.createMatchIfMutual(listingId, playerId);
    return { matched };
  }

  /** Le club retire son interet. Le joueur n'en est pas informe. */
  async clubUnlike(userId: string, listingId: string, playerId: string): Promise<void> {
    await this.assertListingOfMyTeam(userId, listingId);
    const match = await this.prisma.match.findUnique({
      where: { listingId_playerId: { listingId, playerId } },
      select: { id: true },
    });
    if (match) {
      throw new ConflictException({
        code: 'MATCH_EXISTS',
        message: 'This interest already produced a match.',
      });
    }
    await this.prisma.clubInterest.deleteMany({ where: { listingId, playerId } });
  }

  /** Les joueurs de cette annonce que le club a deja retenus. */
  async clubLikes(userId: string, listingId: string): Promise<string[]> {
    await this.assertListingOfMyTeam(userId, listingId);
    const rows = await this.prisma.clubInterest.findMany({
      where: { listingId },
      select: { playerId: true },
    });
    return rows.map((row) => row.playerId);
  }

  // --- Le match ------------------------------------------------------------

  /**
   * Le `Match` : les deux cotes se sont prononces sur la MEME annonce.
   *
   * 🔴 **Seul un `APPLIED` compte.** Un signet prive n'a jamais engage personne
   * — le filtre `kind` ci-dessous est la garantie que « je garde pour y penser »
   * ne devient jamais « je veux vous parler ».
   *
   * La `Conversation` est creee AVEC le match. Le modele dit qu'un match en a
   * une ; la creer plus tard signifierait deux chemins de code et une fenetre ou
   * un match existe sans endroit ou parler.
   */
  private async createMatchIfMutual(listingId: string, playerId: string): Promise<boolean> {
    const [application, clubInterest, already] = await Promise.all([
      this.prisma.playerInterest.findFirst({
        where: { listingId, playerId, kind: PlayerInterestKind.APPLIED },
        select: { id: true },
      }),
      this.prisma.clubInterest.findUnique({
        where: { listingId_playerId: { listingId, playerId } },
        select: { id: true },
      }),
      this.prisma.match.findUnique({
        where: { listingId_playerId: { listingId, playerId } },
        select: { id: true },
      }),
    ]);

    if (already) {
      return true;
    }
    if (!application || !clubInterest) {
      return false;
    }

    const match = await this.prisma.match.create({
      data: { listingId, playerId, conversation: { create: {} } },
    });

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
    if (player) {
      await this.prisma.notification.create({
        data: {
          userId: player.userId,
          type: NotificationType.MATCH,
          data: { listingId, matchId: match.id },
        },
      });
    }
    await this.notifyClub(listingId, playerId, NotificationType.MATCH, { matchId: match.id });
    return true;
  }

  // --- Outils --------------------------------------------------------------

  /** L'annonce appartient-elle a une equipe que cet utilisateur peut gerer ? */
  private async assertListingOfMyTeam(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { team: true },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }
    await this.teams.assertTeamAccess(userId, listing.teamId);
    return listing;
  }

  /**
   * Prevenir le club.
   *
   * ⚠️ **Pas « tout le club ».** Les destinataires sont les administrateurs, qui
   * ont la vision globale, et les entraineurs ASSIGNES a cette equipe. Un
   * entraineur des juniors n'a pas a etre notifie d'une candidature en premiere
   * ligue : c'est la meme frontiere que partout ailleurs dans l'app, et
   * l'elargir ici la rendrait fausse ailleurs.
   */
  private async notifyClub(
    listingId: string,
    playerId: string,
    type: NotificationType,
    extra: Prisma.JsonObject = {},
  ): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { team: true },
    });
    if (!listing) {
      return;
    }

    const members = await this.prisma.clubMember.findMany({
      where: {
        clubId: listing.team.clubId,
        OR: [
          { role: ClubMemberRole.CLUB_ADMIN },
          { teamAssignments: { some: { teamId: listing.teamId } } },
        ],
      },
      select: { userId: true },
    });
    if (members.length === 0) {
      return;
    }

    await this.prisma.notification.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        type,
        data: { listingId, playerId, ...extra },
      })),
    });
  }
}

/**
 * `secondaryPostes` est une colonne JSON : Prisma la rend en `JsonValue`, pas en
 * tableau typé. On ne fait confiance ni a sa forme ni a son contenu.
 */
function parsePostes(value: Prisma.JsonValue): Poste[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Poste => typeof item === 'string');
}
