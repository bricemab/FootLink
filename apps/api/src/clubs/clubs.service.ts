import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Club, ClubMember, ClubMemberRole, ClubStatus, Prisma, UserRole } from '@prisma/client';
import { regionForCanton } from '@footlink/shared';
import { MailService } from '../mail/mail.service';
import { PlacesService } from '../geo/places.service';
import { MediaService, type UploadTicket } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestClubDto, UpdateClubDto } from './dto/club.dto';

/**
 * Site du club : on accepte « fcsion.ch » et on stocke une URL complète.
 *
 * Sans schéma, la valeur est inutilisable telle quelle — un `Linking.openURL`
 * côté app échouerait, et un `<a href>` la traiterait comme un chemin relatif.
 * On force `https` : proposer `http` en 2026 reviendrait à envoyer les
 * utilisateurs sur une page non chiffrée, et les sites de clubs qui n'ont pas
 * de TLS sont de toute façon en train de disparaître.
 */
function normalizeWebsite(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Terrain résolu : ce qui sera réellement écrit en base pour la localisation. */
interface PitchLocation {
  lat: Prisma.Decimal;
  lng: Prisma.Decimal;
  canton: string;
  locality: string;
  regionCode: string | null;
}

export interface ClubContext {
  club: Club;
  member: ClubMember;
}

/** Code stable pour le mobile : un compte ne peut être rattaché qu'à un club. */
export const CLUB_ALREADY_LINKED_CODE = 'CLUB_ALREADY_LINKED';

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly places: PlacesService,
    private readonly media: MediaService,
  ) {}

  /**
   * Demande de compte club, par un utilisateur **déjà authentifié**.
   *
   * L'identité est prouvée en amont — code à 6 chiffres reçu par email, ou
   * Google — avant qu'on crée quoi que ce soit. Le club naît en PENDING et ne
   * peut rien publier tant qu'un SUPER_ADMIN ne l'a pas validé.
   */
  async requestClub(
    userId: string,
    dto: RequestClubDto,
  ): Promise<{ club: { id: string; name: string; status: ClubStatus } }> {
    const alreadyMember = await this.prisma.clubMember.findFirst({ where: { userId } });
    if (alreadyMember) {
      // Code métier distinct : sans lui, le mobile traduisait ce 409 par
      // « adresse déjà utilisée », ce qui n'a rien à voir et envoyait
      // l'utilisateur corriger un email parfaitement valide.
      throw new ConflictException({
        code: CLUB_ALREADY_LINKED_CODE,
        message: 'This account is already linked to a club.',
      });
    }
    await this.assertRegionExists(dto.regionCode);

    // Le terrain donne le canton, qui donne l'association. Tout est recalculé
    // ici : le client n'a envoyé qu'un point.
    const pitch = await this.resolvePitch(dto.lat, dto.lng, dto.regionCode);
    if (pitch) {
      await this.assertRegionExists(pitch.regionCode ?? undefined);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const club = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club.create({
        data: {
          name: dto.clubName,
          status: ClubStatus.PENDING,
          contactEmail: dto.contactEmail?.toLowerCase() ?? user.email,
          requestNote: dto.requestNote ?? null,
          websiteUrl: normalizeWebsite(dto.websiteUrl),
          stadiumName: dto.stadiumName ?? null,
          addressLine: dto.addressLine ?? null,
          // Sans terrain résolu (service indisponible, saisie manuelle), on
          // garde ce qu'on a plutôt que de refuser l'inscription.
          regionCode: pitch?.regionCode ?? dto.regionCode ?? null,
          canton: pitch?.canton ?? null,
          locality: pitch?.locality ?? dto.locality ?? null,
          ...(pitch ? { lat: pitch.lat, lng: pitch.lng } : {}),
          members: {
            create: { userId, role: ClubMemberRole.CLUB_ADMIN, isOwner: true },
          },
        },
      });
      // Le rôle principal suit l'activité réelle du compte. Les droits sur le
      // club viennent du ClubMember : un joueur devenu responsable garde donc
      // son profil joueur intact.
      await tx.user.update({ where: { id: userId }, data: { role: UserRole.CLUB_ADMIN } });
      return created;
    });

    return { club: { id: club.id, name: club.name, status: club.status } };
  }

  // --- Côté club (le clubId n'est JAMAIS pris du client : anti-IDOR) ---
  async getMyClub(userId: string) {
    const member = await this.prisma.clubMember.findFirst({
      where: { userId },
      include: { club: { include: { region: true } } },
    });
    if (!member) {
      return null;
    }
    return {
      club: member.club,
      membership: { role: member.role, isOwner: member.isOwner },
      canOperate: member.club.status === ClubStatus.APPROVED,
      /*
       * Vue satellite du terrain, fabriquée ICI et non côté app.
       *
       * L'URL porte le jeton Mapbox : la construire côté client obligerait à lui
       * livrer ce jeton. `null` quand le club n'a pas de point (repli sur une
       * localité saisie à la main) ou quand Mapbox n'est pas configuré.
       */
      aerialUrl: this.aerialUrlOf(member.club.lat, member.club.lng),
      /**
       * URL de lecture signee du logo, resolue par le serveur.
       *
       * `Club.logoKey` porte la CLE et non une URL : le bucket est prive, donc
       * l'adresse de lecture est signee et perissable. La resoudre ici evite que
       * chaque ecran ait a le savoir.
       */
      logoUrl: await this.media.readUrl(member.club.logoKey),
    };
  }

  /**
   * Billet de televersement du logo. Reserve au CLUB_ADMIN de CE club, et
   * possible avant l'approbation : preparer sa fiche pendant l'attente est
   * legitime, la publier ne l'est pas.
   */
  async createLogoUpload(userId: string, contentType: string): Promise<UploadTicket> {
    const { club } = await this.assertClubAdminOfMine(userId);
    return this.media.createClubLogoUpload(club.id, contentType);
  }

  /**
   * Rattache un objet televersee au club, apres verification.
   *
   * L'ancien logo est supprime APRES la mise a jour : dans l'autre ordre, un
   * echec d'ecriture laisserait le club avec une cle qui ne pointe plus sur rien.
   */
  async confirmLogo(userId: string, key: string) {
    const { club } = await this.assertClubAdminOfMine(userId);
    await this.media.confirmClubLogoUpload(club.id, key);

    /*
     * La cle remplacee est relue DANS la transaction, et non prise sur l'objet
     * charge plus haut.
     *
     * Deux confirmations concurrentes partaient sinon du meme `logoKey` : la
     * seconde ecrasait la premiere sans supprimer son objet, qui restait
     * orphelin dans le bucket. Rare (il faut televerser deux logos en meme
     * temps), mais un objet orphelin ne se retrouve jamais ensuite.
     */
    const previous = await this.prisma.$transaction(async (tx) => {
      const current = await tx.club.findUniqueOrThrow({
        where: { id: club.id },
        select: { logoKey: true },
      });
      await tx.club.update({
        where: { id: club.id },
        data: { logoKey: key, logoUpdatedAt: new Date() },
      });
      return current.logoKey;
    });

    if (previous && previous !== key) {
      await this.media.delete(previous);
    }
    return { logoUrl: await this.media.readUrl(key) };
  }

  async removeLogo(userId: string): Promise<void> {
    const { club } = await this.assertClubAdminOfMine(userId);
    if (!club.logoKey) {
      return;
    }
    await this.prisma.club.update({
      where: { id: club.id },
      data: { logoKey: null, logoUpdatedAt: new Date() },
    });
    await this.media.delete(club.logoKey);
  }

  /**
   * Le club de l'appelant, a condition qu'il en soit CLUB_ADMIN.
   *
   * `requireApproved: false` : la configuration de la fiche n'est pas une
   * publication. Le role vient du `ClubMember` et non du `User`, pour qu'un
   * joueur qui dirige aussi un club garde ses droits.
   */
  private async assertClubAdminOfMine(userId: string): Promise<ClubContext> {
    const context = await this.getMyClubContext(userId, false);
    if (context.member.role !== ClubMemberRole.CLUB_ADMIN) {
      throw new ForbiddenException('Restricted to the club administrator.');
    }
    return context;
  }

  private aerialUrlOf(lat: Prisma.Decimal | null, lng: Prisma.Decimal | null): string | null {
    if (lat === null || lng === null) {
      return null;
    }
    const url = this.places.aerialUrl(lat.toNumber(), lng.toNumber());
    return url.length > 0 ? url : null;
  }

  // Contexte club de l'utilisateur authentifié. requireApproved = garde d'accès
  // AGENTS §4bis : rien de publiable tant que le club n'est pas APPROVED.
  async getMyClubContext(userId: string, requireApproved = true): Promise<ClubContext> {
    const member = await this.prisma.clubMember.findFirst({
      where: { userId },
      include: { club: true },
    });
    if (!member) {
      throw new ForbiddenException('No club is linked to this account.');
    }
    if (requireApproved && member.club.status !== ClubStatus.APPROVED) {
      throw new ForbiddenException('The club must be approved before performing this action.');
    }
    return { club: member.club, member };
  }

  async updateMyClub(userId: string, dto: UpdateClubDto) {
    const { club } = await this.assertClubAdminOfMine(userId);
    await this.assertRegionExists(dto.regionCode);

    const pitch = await this.resolvePitch(dto.lat, dto.lng, dto.regionCode);
    if (pitch) {
      await this.assertRegionExists(pitch.regionCode ?? undefined);
    }

    return this.prisma.club.update({
      where: { id: club.id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        contactEmail: dto.contactEmail?.toLowerCase() ?? undefined,
        showContactEmail: dto.showContactEmail ?? undefined,
        websiteUrl: normalizeWebsite(dto.websiteUrl) ?? undefined,
        stadiumName: dto.stadiumName ?? undefined,
        addressLine: dto.addressLine ?? undefined,
        regionCode: pitch?.regionCode ?? dto.regionCode ?? undefined,
        // Déplacer le terrain déplace le canton et la commune avec lui : les
        // laisser en arrière donnerait un club rangé dans la mauvaise région.
        ...(pitch
          ? { lat: pitch.lat, lng: pitch.lng, canton: pitch.canton, locality: pitch.locality }
          : {}),
      },
      include: { region: true },
    });
  }

  /**
   * Point -> canton, commune, association. `null` si aucun point n'est fourni.
   *
   * Les coordonnées sont stockées **telles quelles**, sans l'arrondi à ~1 km
   * appliqué aux joueurs : un terrain est un équipement public, l'arrondir ne
   * protégerait personne et introduirait jusqu'à un kilomètre d'erreur dans le
   * matching par distance qu'on construit en Phase 6.
   */
  private async resolvePitch(
    lat: number | undefined,
    lng: number | undefined,
    regionOverride: string | undefined,
  ): Promise<PitchLocation | null> {
    if (lat === undefined || lng === undefined) {
      return null;
    }
    const { canton, locality } = await this.places.resolvePoint(lat, lng);
    return {
      lat: new Prisma.Decimal(lat),
      lng: new Prisma.Decimal(lng),
      canton,
      locality,
      // Le choix explicite de l'utilisateur prime : la déduction n'est fiable
      // que pour les associations mono-cantonales (cf. CANTON_TO_REGION).
      regionCode: regionOverride ?? regionForCanton(canton),
    };
  }

  // Liste des clubs sélectionnables par un joueur (club actuel). Lien DÉCLARATIF :
  // sélectionner un club ne crée AUCUN ClubMember et aucun droit.
  /**
   * Clubs selectionnables par un joueur (son club actuel). Lien DECLARATIF :
   * selectionner un club ne cree aucun ClubMember et aucun droit.
   *
   * Le logo sort en URL signee. Rendre la cle brute serait inutilisable cote
   * app, et exposerait un chemin du bucket pour rien.
   */
  async listSelectableClubs(search?: string) {
    const clubs = await this.prisma.club.findMany({
      where: {
        status: ClubStatus.APPROVED,
        ...(search ? { name: { contains: search } } : {}),
      },
      select: {
        id: true,
        name: true,
        canton: true,
        locality: true,
        logoKey: true,
        regionCode: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return Promise.all(
      clubs.map(async ({ logoKey, ...club }) => ({
        ...club,
        logoUrl: await this.media.readUrl(logoKey),
      })),
    );
  }

  listRegions() {
    return this.prisma.region.findMany({ orderBy: { labelFr: 'asc' } });
  }

  // --- SUPER_ADMIN ---
  listClubs(status?: ClubStatus) {
    return this.prisma.club.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        region: true,
        members: {
          include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
        },
      },
    });
  }

  async decide(clubId: string, approved: boolean): Promise<Club> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: { members: { include: { user: true } } },
    });
    if (!club) {
      throw new NotFoundException('Club not found.');
    }
    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        status: approved ? ClubStatus.APPROVED : ClubStatus.REJECTED,
        reviewedAt: new Date(),
      },
    });
    const owner = club.members.find((m) => m.isOwner)?.user;
    if (owner) {
      await this.mail.sendClubDecisionEmail(owner.email, club.name, approved, owner.locale);
    }
    return updated;
  }

  private async assertRegionExists(regionCode?: string): Promise<void> {
    if (!regionCode) {
      return;
    }
    const region = await this.prisma.region.findUnique({ where: { code: regionCode } });
    if (!region) {
      throw new BadRequestException('Unknown region (association).');
    }
  }
}
