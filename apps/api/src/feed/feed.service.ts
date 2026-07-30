import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getCurrentSeasonLabel,
  getEligibleCategories,
  getSeasonStartYear,
  type Poste,
} from '@footlink/shared';
import { ClubStatus, ListingStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import type { FeedQueryDto } from './dto/feed.dto';

/**
 * Rayon de la Terre en kilometres. Valeur du haversine, pas une approximation
 * de confort : c'est elle qui fait qu'« a 12 km » veut dire quelque chose.
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Pourquoi une annonce et un joueur se sont rencontres.
 *
 * 🔴 **Ce n'est pas de la decoration.** Un feed qui ne se justifie pas inspire
 * la mefiance : on ne confie pas une saison a un inconnu propose sans raison.
 * Le serveur calcule deja ces criteres pour filtrer — les renvoyer ne coute
 * rien et transforme une liste opaque en liste credible.
 *
 * L'ordre des valeurs EST l'ordre de pertinence, et il sert de tri.
 */
export const MATCH_KINDS = [
  /** L'annonce cherche exactement le poste principal du joueur. */
  'POSTE_PRINCIPAL',
  /** L'annonce cherche un poste que le joueur sait tenir en secondaire. */
  'POSTE_SECONDAIRE',
  /** Le poste principal du joueur fait partie des postes acceptes. */
  'POSTE_ACCEPTE',
  /** Un poste secondaire du joueur fait partie des postes acceptes. */
  'POSTE_ACCEPTE_SECONDAIRE',
] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export interface FeedListing {
  id: string;
  posteRecherche: Poste;
  secondaryPostes: Poste[];
  description: string | null;
  season: string;
  createdAt: string;
  team: { id: string; name: string | null; category: string; gender: string };
  club: { id: string; name: string; locality: string | null; canton: string | null };
  /** Pourquoi cette annonce est proposee. Voir `MATCH_KINDS`. */
  matchKind: MatchKind;
  /** Le poste qui a produit la correspondance — celui qu'on met en avant. */
  matchedPoste: Poste;
  /** Distance a vol d'oiseau, arrondie au kilometre. */
  distanceKm: number;
}

export interface FeedPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  currentCategory: string | null;
  currentClubName: string | null;
  locality: string | null;
  canton: string | null;
  bio: string | null;
  postes: { poste: Poste; isPrimary: boolean }[];
  matchKind: MatchKind;
  matchedPoste: Poste;
  distanceKm: number;
}

/** Ligne brute renvoyee par la requete SQL du feed joueur. */
interface ListingRow {
  id: string;
  matchRank: number;
  matchedPoste: Poste;
  distanceKm: number;
}

/** Ligne brute renvoyee par la requete SQL du feed club. */
interface PlayerRow {
  id: string;
  matchRank: number;
  matchedPoste: Poste;
  distanceKm: number;
}

/**
 * Le feed : l'endroit ou joueurs et clubs se rencontrent enfin.
 *
 * 🔴 **Tout le filtrage est fait par le SERVEUR, et en SQL.** Charger les
 * annonces puis trier en JavaScript obligerait a rapatrier toute la Suisse pour
 * en garder trois, et surtout laisserait a l'app le soin de decider ce qu'elle
 * a le droit de voir — exactement ce qu'on ne veut pas.
 *
 * Le tri combine deux choses, dans cet ordre :
 *
 * 1. **la pertinence du poste** — une annonce qui cherche precisement le poste
 *    principal du joueur passe avant une annonce qui l'accepterait en depannage,
 *    meme si la seconde est plus proche. On cherche un club ou jouer a SON
 *    poste, pas le club le plus proche ;
 * 2. **la distance** — a pertinence egale, le plus proche gagne.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
  ) {}

  /**
   * Les annonces qui correspondent au joueur connecte.
   *
   * Refuse explicitement plutot que de renvoyer une liste vide quand il manque
   * une donnee indispensable : une liste vide se lit « aucun club ne veut de
   * moi », ce qui est faux et decourageant. Un code d'erreur permet a l'app
   * d'envoyer la personne completer ce qui manque.
   */
  async listingsForPlayer(userId: string, query: FeedQueryDto): Promise<FeedListing[]> {
    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { positions: true },
    });
    if (!player) {
      throw new BadRequestException({
        code: 'PLAYER_PROFILE_REQUIRED',
        message: 'Complete your player profile first.',
      });
    }
    if (player.lat === null || player.lng === null) {
      throw new BadRequestException({
        code: 'PLAYER_LOCATION_REQUIRED',
        message: 'Set your location to see nearby clubs.',
      });
    }

    const primary = player.positions.find((position) => position.isPrimary)?.poste;
    if (!primary) {
      throw new BadRequestException({
        code: 'PLAYER_POSITION_REQUIRED',
        message: 'Choose your main position first.',
      });
    }
    const secondary = player.positions.filter((p) => !p.isPrimary).map((p) => p.poste);

    const seasonStartYear = getSeasonStartYear(new Date());
    const eligible = getEligibleCategories(player.birthYear, seasonStartYear, player.gender);
    if (eligible.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<ListingRow[]>`
      SELECT
        l.id AS id,
        ${this.matchRankSql(primary, secondary)} AS matchRank,
        ${this.matchedPosteSql(primary, secondary)} AS matchedPoste,
        ${this.distanceSql(
          Number(player.lat),
          Number(player.lng),
          Prisma.sql`c.lat`,
          Prisma.sql`c.lng`,
        )} AS distanceKm
      FROM Listing l
      JOIN Team t ON t.id = l.teamId
      JOIN Club c ON c.id = t.clubId
      WHERE l.status = ${ListingStatus.ACTIVE}
        AND l.season = ${getCurrentSeasonLabel(new Date())}
        -- Ceinture et bretelles avec l'ordonnanceur : une annonce echue ne doit
        -- jamais apparaitre, meme si le passage quotidien n'a pas encore tourne.
        AND (l.expiresAt IS NULL OR l.expiresAt > NOW())
        AND c.status = ${ClubStatus.APPROVED}
        AND c.lat IS NOT NULL AND c.lng IS NOT NULL
        -- Le genre de l'EQUIPE, pas celui du club : un club a souvent les deux.
        AND t.gender = ${player.gender}
        AND t.category IN (${Prisma.join(eligible)})
        AND ${this.posteMatchSql(primary, secondary)}
        AND ${this.distanceSql(
          Number(player.lat),
          Number(player.lng),
          Prisma.sql`c.lat`,
          Prisma.sql`c.lng`,
        )} <= ${player.searchRadiusKm}
        -- Deja decide : postule ou mis de cote. Le revoir dans le feed donnerait
        -- l'impression que le geste precedent n'a servi a rien.
        AND NOT EXISTS (
          SELECT 1 FROM PlayerInterest pi
          WHERE pi.listingId = l.id AND pi.playerId = ${player.id}
        )
        ${this.blockFilterSql(userId, Prisma.sql`cm.userId`)}
      ORDER BY matchRank ASC, distanceKm ASC, l.createdAt DESC, l.id ASC
      LIMIT ${query.limit ?? 20} OFFSET ${query.offset ?? 0}
    `;

    return this.hydrateListings(rows);
  }

  /**
   * Les joueurs qui correspondent a une annonce du club.
   *
   * ⚠️ **Le rayon du JOUEUR s'applique ici aussi.** C'est contre-intuitif — le
   * club n'a rien demande — mais c'est la seule lecture honnete : un joueur qui
   * a dit « 15 km » ne doit pas apparaitre comme disponible a un club situe a
   * 80 km. Le club perdrait son temps et le joueur recevrait des propositions
   * qu'il a explicitement exclues.
   */
  async playersForListing(
    userId: string,
    listingId: string,
    query: FeedQueryDto,
  ): Promise<FeedPlayer[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { team: { include: { club: true } } },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }
    // Reutilise la garde des equipes : club APPROVED, et un entraineur cantonne
    // a ses equipes assignees. Jamais reecrite ici — une garde dupliquee est une
    // garde qui divergera.
    await this.teams.assertTeamAccess(userId, listing.teamId);

    const club = listing.team.club;
    if (club.lat === null || club.lng === null) {
      throw new BadRequestException({
        code: 'CLUB_LOCATION_REQUIRED',
        message: 'Set your pitch location first.',
      });
    }

    const accepted = this.secondaryPostesOf(listing.secondaryPostes);
    const rows = await this.prisma.$queryRaw<PlayerRow[]>`
      SELECT
        p.id AS id,
        ${this.playerRankSql(listing.posteRecherche, accepted)} AS matchRank,
        ${this.playerMatchedPosteSql(listing.posteRecherche, accepted)} AS matchedPoste,
        ${this.distanceSql(
          Number(club.lat),
          Number(club.lng),
          Prisma.sql`p.lat`,
          Prisma.sql`p.lng`,
        )} AS distanceKm
      FROM PlayerProfile p
      JOIN User u ON u.id = p.userId
      WHERE p.isVisible = TRUE
        AND p.isSeekingClub = TRUE
        AND u.status = ${UserStatus.ACTIVE}
        AND p.lat IS NOT NULL AND p.lng IS NOT NULL
        AND p.gender = ${listing.team.gender}
        AND ${this.eligibleCategorySql(listing.team.category)}
        AND EXISTS (
          SELECT 1 FROM PlayerPosition pp
          WHERE pp.playerId = p.id
            AND pp.poste IN (${Prisma.join([listing.posteRecherche, ...accepted])})
        )
        -- Le rayon du joueur, applique dans ce sens aussi : voir le commentaire
        -- de cette methode.
        AND ${this.distanceSql(
          Number(club.lat),
          Number(club.lng),
          Prisma.sql`p.lat`,
          Prisma.sql`p.lng`,
        )} <= p.searchRadiusKm
        AND NOT EXISTS (
          SELECT 1 FROM ClubInterest ci
          WHERE ci.listingId = ${listing.id} AND ci.playerId = p.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM Block b
          WHERE (b.blockerUserId = ${userId} AND b.blockedUserId = u.id)
             OR (b.blockerUserId = u.id AND b.blockedUserId = ${userId})
        )
      ORDER BY matchRank ASC, distanceKm ASC, p.id ASC
      LIMIT ${query.limit ?? 20} OFFSET ${query.offset ?? 0}
    `;

    return this.hydratePlayers(rows);
  }

  // --- Fragments SQL -------------------------------------------------------

  /**
   * Haversine, en kilometres.
   *
   * 🔴 **En SQL et non en JavaScript.** Calculer la distance apres coup
   * obligerait a rapatrier toutes les annonces de Suisse pour en garder trois,
   * et rendrait impossible le `LIMIT` — donc la pagination.
   *
   * Les coordonnees du joueur sont deja arrondies a ~1 km (AGENTS §6.5), ce qui
   * borne naturellement la precision : afficher « 12,4 km » serait mentir sur ce
   * qu'on sait. D'ou l'arrondi au kilometre a la sortie.
   */
  private distanceSql(
    lat: number,
    lng: number,
    targetLat: Prisma.Sql,
    targetLng: Prisma.Sql,
  ): Prisma.Sql {
    return Prisma.sql`(
      ${EARTH_RADIUS_KM} * 2 * ASIN(SQRT(
        POWER(SIN((RADIANS(${targetLat}) - RADIANS(${lat})) / 2), 2)
        + COS(RADIANS(${lat})) * COS(RADIANS(${targetLat}))
        * POWER(SIN((RADIANS(${targetLng}) - RADIANS(${lng})) / 2), 2)
      ))
    )`;
  }

  /**
   * Le poste correspond-il ?
   *
   * Quatre chemins, tous legitimes : l'annonce cherche un poste que le joueur
   * tient (principal ou secondaire), ou l'un des postes du joueur figure parmi
   * ceux que l'annonce accepte.
   *
   * ⚠️ `secondaryPostes` est une colonne JSON : la comparaison passe par
   * `JSON_CONTAINS`, et le poste doit y etre injecte comme une CHAINE JSON
   * (guillemets compris), sinon MySQL compare une valeur scalaire a un tableau
   * de chaines et ne trouve jamais rien.
   */
  private posteMatchSql(primary: Poste, secondary: Poste[]): Prisma.Sql {
    const all = [primary, ...secondary];
    return Prisma.sql`(
      l.posteRecherche IN (${Prisma.join(all)})
      OR ${Prisma.join(
        all.map(
          (poste) =>
            Prisma.sql`JSON_CONTAINS(COALESCE(l.secondaryPostes, JSON_ARRAY()), ${JSON.stringify(poste)})`,
        ),
        ' OR ',
      )}
    )`;
  }

  /** Rang de pertinence — voir `MATCH_KINDS`, dont il suit l'ordre. */
  private matchRankSql(primary: Poste, secondary: Poste[]): Prisma.Sql {
    const secondaryOr =
      secondary.length > 0
        ? Prisma.sql`WHEN l.posteRecherche IN (${Prisma.join(secondary)}) THEN 1`
        : Prisma.empty;
    return Prisma.sql`CASE
      WHEN l.posteRecherche = ${primary} THEN 0
      ${secondaryOr}
      WHEN JSON_CONTAINS(COALESCE(l.secondaryPostes, JSON_ARRAY()), ${JSON.stringify(primary)}) THEN 2
      ELSE 3
    END`;
  }

  /** Le poste a mettre en avant : celui qui a reellement produit la rencontre. */
  private matchedPosteSql(primary: Poste, secondary: Poste[]): Prisma.Sql {
    const secondaryCase =
      secondary.length > 0
        ? Prisma.sql`WHEN l.posteRecherche IN (${Prisma.join(secondary)}) THEN l.posteRecherche`
        : Prisma.empty;
    return Prisma.sql`CASE
      WHEN l.posteRecherche = ${primary} THEN l.posteRecherche
      ${secondaryCase}
      ELSE ${primary}
    END`;
  }

  /** Miroir du rang, cote club : ce que l'annonce cherche contre les postes du joueur. */
  private playerRankSql(wanted: Poste, accepted: Poste[]): Prisma.Sql {
    const acceptedCase =
      accepted.length > 0
        ? Prisma.sql`WHEN EXISTS (
            SELECT 1 FROM PlayerPosition pp
            WHERE pp.playerId = p.id AND pp.isPrimary = TRUE
              AND pp.poste IN (${Prisma.join(accepted)})
          ) THEN 2`
        : Prisma.empty;
    return Prisma.sql`CASE
      WHEN EXISTS (
        SELECT 1 FROM PlayerPosition pp
        WHERE pp.playerId = p.id AND pp.isPrimary = TRUE AND pp.poste = ${wanted}
      ) THEN 0
      WHEN EXISTS (
        SELECT 1 FROM PlayerPosition pp
        WHERE pp.playerId = p.id AND pp.isPrimary = FALSE AND pp.poste = ${wanted}
      ) THEN 1
      ${acceptedCase}
      ELSE 3
    END`;
  }

  private playerMatchedPosteSql(wanted: Poste, accepted: Poste[]): Prisma.Sql {
    const acceptedCase =
      accepted.length > 0
        ? Prisma.sql`WHEN EXISTS (
            SELECT 1 FROM PlayerPosition pp
            WHERE pp.playerId = p.id AND pp.poste IN (${Prisma.join(accepted)})
          ) THEN (
            SELECT pp.poste FROM PlayerPosition pp
            WHERE pp.playerId = p.id AND pp.poste IN (${Prisma.join(accepted)})
            ORDER BY pp.isPrimary DESC LIMIT 1
          )`
        : Prisma.empty;
    return Prisma.sql`CASE
      WHEN EXISTS (
        SELECT 1 FROM PlayerPosition pp WHERE pp.playerId = p.id AND pp.poste = ${wanted}
      ) THEN ${wanted}
      ${acceptedCase}
      ELSE ${wanted}
    END`;
  }

  /**
   * La categorie de l'equipe fait-elle partie de celles que le joueur peut jouer ?
   *
   * Le calcul vit dans `packages/shared` et depend de l'annee de naissance : on
   * ne peut donc pas l'ecrire en SQL sans dupliquer la regle. On inverse : pour
   * chaque annee de naissance possible, la categorie est-elle eligible ? Une
   * seule expression, et la regle reste a un seul endroit.
   */
  private eligibleCategorySql(category: string): Prisma.Sql {
    const seasonStartYear = getSeasonStartYear(new Date());
    // 16 ans minimum (MVP), et personne ne joue au-dela de 80 ans.
    const years: number[] = [];
    for (let year = seasonStartYear - 80; year <= seasonStartYear - 16; year += 1) {
      const eligible = getEligibleCategories(year, seasonStartYear, 'MALE').includes(
        category as never,
      );
      const eligibleF = getEligibleCategories(year, seasonStartYear, 'FEMALE').includes(
        category as never,
      );
      if (eligible || eligibleF) {
        years.push(year);
      }
    }
    if (years.length === 0) {
      return Prisma.sql`FALSE`;
    }
    return Prisma.sql`p.birthYear IN (${Prisma.join(years)})`;
  }

  /**
   * Blocages, dans les DEUX SENS.
   *
   * Ne filtrer que « ceux que j'ai bloques » laisserait quelqu'un continuer a
   * voir la personne qui l'a bloque — ce qui vide le blocage de son sens.
   */
  private blockFilterSql(userId: string, otherUserId: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`AND NOT EXISTS (
      SELECT 1 FROM ClubMember cm
      JOIN Block b ON (
        (b.blockerUserId = ${userId} AND b.blockedUserId = ${otherUserId})
        OR (b.blockerUserId = ${otherUserId} AND b.blockedUserId = ${userId})
      )
      WHERE cm.clubId = c.id
    )`;
  }

  // --- Hydratation ---------------------------------------------------------

  /**
   * La requete SQL ne renvoie que des identifiants et les criteres calcules ;
   * le detail est relu par Prisma. On evite ainsi de reconstruire a la main la
   * serialisation des relations — et l'ordre du SQL, lui, est preserve.
   */
  private async hydrateListings(rows: ListingRow[]): Promise<FeedListing[]> {
    if (rows.length === 0) {
      return [];
    }
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            category: true,
            gender: true,
            club: { select: { id: true, name: true, locality: true, canton: true } },
          },
        },
      },
    });
    const byId = new Map(listings.map((listing) => [listing.id, listing]));

    return rows.flatMap((row) => {
      const listing = byId.get(row.id);
      if (!listing) {
        return [];
      }
      return [
        {
          id: listing.id,
          posteRecherche: listing.posteRecherche,
          secondaryPostes: this.secondaryPostesOf(listing.secondaryPostes),
          description: listing.description,
          season: listing.season,
          createdAt: listing.createdAt.toISOString(),
          team: {
            id: listing.team.id,
            name: listing.team.name,
            category: listing.team.category,
            gender: listing.team.gender,
          },
          club: listing.team.club,
          matchKind: MATCH_KINDS[row.matchRank] ?? 'POSTE_ACCEPTE_SECONDAIRE',
          matchedPoste: row.matchedPoste,
          distanceKm: Math.round(Number(row.distanceKm)),
        },
      ];
    });
  }

  private async hydratePlayers(rows: PlayerRow[]): Promise<FeedPlayer[]> {
    if (rows.length === 0) {
      return [];
    }
    const players = await this.prisma.playerProfile.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: { positions: true },
    });
    const byId = new Map(players.map((player) => [player.id, player]));

    return rows.flatMap((row) => {
      const player = byId.get(row.id);
      if (!player) {
        return [];
      }
      return [
        {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          birthYear: player.birthYear,
          currentCategory: player.currentCategory,
          // Masque a la demande du joueur : c'est tout l'objet de ce drapeau.
          currentClubName: player.hideCurrentClub ? null : player.currentClubName,
          locality: player.locality,
          canton: player.canton,
          bio: player.bio,
          postes: player.positions.map((position) => ({
            poste: position.poste,
            isPrimary: position.isPrimary,
          })),
          matchKind: MATCH_KINDS[row.matchRank] ?? 'POSTE_ACCEPTE_SECONDAIRE',
          matchedPoste: row.matchedPoste,
          distanceKm: Math.round(Number(row.distanceKm)),
        },
      ];
    });
  }

  /** `secondaryPostes` est un `Json?` : on ne fait jamais confiance a sa forme. */
  private secondaryPostesOf(raw: Prisma.JsonValue | null): Poste[] {
    return Array.isArray(raw) ? (raw as Poste[]) : [];
  }
}
