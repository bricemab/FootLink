import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getCurrentSeasonLabel } from '@footlink/shared';
import { ClubMemberRole, Listing, ListingStatus, Poste, Prisma } from '@prisma/client';
import { ClubsService } from '../clubs/clubs.service';
import { FeedService } from '../feed/feed.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { CreateListingDto, ListListingsQueryDto, UpdateListingDto } from './dto/listing.dto';

/** Ce qu'une suppression d'annonce emporterait avec elle. */
export interface ListingDeletionImpact {
  listingId: string;
  applications: number;
  clubInterests: number;
  matches: number;
  conversations: number;
  messages: number;
  /** Vrai si la suppression ne détruit rien d'autre que l'annonce elle-même. */
  isEmpty: boolean;
}

export const LISTING_CONFIRMATION_REQUIRED_CODE = 'LISTING_DELETION_CONFIRMATION_REQUIRED';

/**
 * Annonces d'un club.
 *
 * Trois règles portent tout le fichier :
 *
 * 1. **Le club vient du token, jamais du corps de la requête** (anti-IDOR).
 * 2. **Publier exige un club APPROVED.** `assertTeamAccess` s'en charge : il
 *    appelle `getMyClubContext` avec `requireApproved` par défaut, donc un club
 *    en attente ne peut ni créer ni modifier une annonce.
 * 3. **Un COACH est cantonné à ses équipes assignées.** C'est aussi
 *    `assertTeamAccess` qui le vérifie — d'où sa réutilisation systématique
 *    plutôt qu'une requête directe sur `listing.findUnique`.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
    private readonly teams: TeamsService,
    private readonly feed: FeedService,
  ) {}

  /**
   * Annonces visibles par l'appelant.
   *
   * Filtrée **par le serveur** selon le rôle, comme `GET /teams` : un
   * entraîneur ne voit que les annonces de ses équipes. L'app ne filtre rien —
   * c'est ce qui garantit qu'un écran réutilisé ailleurs ne fuite pas.
   */
  /**
   * Les annonces du club, avec le nombre de joueurs qui CORRESPONDENT.
   *
   * 🔴 **A ne pas confondre avec les candidatures.** Une candidature est un
   * geste du joueur ; une correspondance est un calcul. Afficher seulement le
   * premier faisait lire « 0 candidature » sur une annonce que trois joueurs
   * pouvaient remplir — un club en concluait que son annonce n'interesse
   * personne, alors qu'il ne l'avait simplement pas encore montree.
   */
  async listMine(userId: string, query: ListListingsQueryDto) {
    const { club, member } = await this.clubs.getMyClubContext(userId, false);

    const teamFilter: Prisma.TeamWhereInput =
      member.role === ClubMemberRole.CLUB_ADMIN
        ? { clubId: club.id }
        : { clubId: club.id, coaches: { some: { clubMemberId: member.id } } };

    const listings = await this.prisma.listing.findMany({
      where: {
        team: teamFilter,
        ...(query.teamId ? { teamId: query.teamId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        team: { select: { id: true, name: true, category: true, gender: true } },
        _count: { select: { interests: true, matches: true } },
      },
    });

    // Un seul appel pour toute la liste : un decompte par annonce ferait autant
    // d'allers-retours qu'il y a d'annonces.
    const counts = await this.feed.matchingCounts(listings.map((listing) => listing.id));
    return listings.map((listing) => ({
      ...listing,
      matchingPlayersCount: counts.get(listing.id) ?? 0,
    }));
  }

  async getOne(userId: string, listingId: string) {
    const listing = await this.assertListingAccess(userId, listingId);
    return this.prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: {
        team: { select: { id: true, name: true, category: true, gender: true } },
        _count: { select: { interests: true, matches: true } },
      },
    });
  }

  /**
   * Crée une annonce pour une équipe du club.
   *
   * La saison est **calculée**, jamais reçue : une annonce datée par l'horloge
   * d'un téléphone se retrouverait dans la mauvaise saison, donc invisible du
   * feed ou visible un an de trop.
   */
  async createListing(userId: string, dto: CreateListingDto): Promise<Listing> {
    const { team } = await this.teams.assertTeamAccess(userId, dto.teamId);

    return this.prisma.listing.create({
      data: {
        teamId: team.id,
        posteRecherche: dto.posteRecherche,
        secondaryPostes: normalizeSecondary(dto.posteRecherche, dto.secondaryPostes),
        description: dto.description?.trim() || null,
        season: getCurrentSeasonLabel(new Date()),
        // `DRAFT` par défaut : on écrit une annonce en plusieurs fois, et la
        // rendre visible doit être un geste explicite.
        status: dto.publish === true ? ListingStatus.ACTIVE : ListingStatus.DRAFT,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async updateListing(userId: string, listingId: string, dto: UpdateListingDto): Promise<Listing> {
    const listing = await this.assertListingAccess(userId, listingId);

    const poste = dto.posteRecherche ?? listing.posteRecherche;
    const secondary =
      dto.secondaryPostes !== undefined
        ? normalizeSecondary(poste, dto.secondaryPostes)
        : normalizeSecondary(poste, readSecondary(listing.secondaryPostes));

    return this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        posteRecherche: poste,
        secondaryPostes: secondary,
        // Chaîne vide = on efface la description ; champ absent = on n'y touche
        // pas. Les deux ne veulent pas dire la même chose.
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: new Date(dto.expiresAt) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /** À lire AVANT de proposer la suppression : c'est le contenu de l'alerte. */
  async getDeletionImpact(userId: string, listingId: string): Promise<ListingDeletionImpact> {
    const listing = await this.assertListingAccess(userId, listingId);
    return this.computeImpact(listing.id);
  }

  /**
   * Supprime l'annonce ET ce qui en dépend : candidatures, intérêts club,
   * matchs, conversations et messages (cascade en base).
   *
   * Irréversible, donc jamais implicite : sans `confirmed`, on refuse et on
   * renvoie le décompte, pour que le client n'ait aucun moyen d'appeler cette
   * route sans avoir de quoi afficher l'alerte. Même discipline que les équipes.
   */
  async deleteListing(userId: string, listingId: string, confirmed: boolean): Promise<void> {
    const listing = await this.assertListingAccess(userId, listingId);
    const impact = await this.computeImpact(listing.id);

    if (!confirmed && !impact.isEmpty) {
      throw new ConflictException({
        code: LISTING_CONFIRMATION_REQUIRED_CODE,
        message: 'Deleting this listing also removes its applications, matches and conversations.',
        impact,
      });
    }
    await this.prisma.listing.delete({ where: { id: listing.id } });
  }

  /**
   * Bascule en `EXPIRED` les annonces actives dont l'échéance est passée.
   *
   * Un statut **écrit**, et non calculé à la lecture : sinon deux endpoints
   * répondraient différemment sur la même donnée selon qu'ils pensent ou non à
   * comparer la date, et le feed finirait par montrer des annonces mortes.
   *
   * Retourne le nombre de lignes touchées, ce qui rend l'opération testable.
   */
  async expireOutdated(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.listing.updateMany({
      where: { status: ListingStatus.ACTIVE, expiresAt: { not: null, lt: now } },
      data: { status: ListingStatus.EXPIRED },
    });
    return count;
  }

  /**
   * Résout une annonce **en passant par l'accès à son équipe**.
   *
   * C'est le point clé de l'anti-IDOR ici : on ne cherche jamais l'annonce
   * seule. Une annonce d'un autre club, ou d'une équipe non assignée à
   * l'entraîneur, est indistinguable d'une annonce inexistante.
   */
  private async assertListingAccess(userId: string, listingId: string): Promise<Listing> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }
    // Lève 403/404 si l'équipe n'est pas accessible à cet utilisateur.
    await this.teams.assertTeamAccess(userId, listing.teamId);
    return listing;
  }

  private async computeImpact(listingId: string): Promise<ListingDeletionImpact> {
    const [applications, clubInterests, matches, conversations, messages] = await Promise.all([
      this.prisma.playerInterest.count({ where: { listingId } }),
      this.prisma.clubInterest.count({ where: { listingId } }),
      this.prisma.match.count({ where: { listingId } }),
      this.prisma.conversation.count({ where: { match: { listingId } } }),
      this.prisma.message.count({ where: { conversation: { match: { listingId } } } }),
    ]);

    return {
      listingId,
      applications,
      clubInterests,
      matches,
      conversations,
      messages,
      isEmpty:
        applications === 0 &&
        clubInterests === 0 &&
        matches === 0 &&
        conversations === 0 &&
        messages === 0,
    };
  }
}

/** Le champ est un `Json?` : on ne lui fait pas confiance à la relecture. */
function readSecondary(value: Prisma.JsonValue | null): Poste[] {
  return Array.isArray(value) ? (value as Poste[]) : [];
}

/**
 * Dédoublonne les postes secondaires et en retire le poste principal.
 *
 * Un poste listé deux fois, ou identique au principal, ne dit rien de plus et
 * fausserait un futur décompte « combien de postes cette annonce couvre-t-elle ».
 */
function normalizeSecondary(main: Poste, secondary: Poste[] | undefined): Poste[] {
  return [...new Set(secondary ?? [])].filter((poste) => poste !== main);
}
