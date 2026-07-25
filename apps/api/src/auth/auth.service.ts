import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClubMemberRole, Locale, TokenType, User, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomInt } from 'node:crypto';
import { splitToken } from '../common/utils/token.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  AcceptCoachInviteDto,
  ForgotPasswordDto,
  GoogleSignInDto,
  LoginDto,
  RegisterDto,
  RequestSignupCodeDto,
  ResetPasswordDto,
  VerifyCoachCodeDto,
  VerifySignupCodeDto,
} from './dto/auth.dto';
import { GoogleService } from './google.service';
import { AuthTokens, TokenService } from './token.service';

/**
 * Code stable pour le mobile. L'adresse est comparée sous sa forme normalisée
 * (cf. `normalizeEmail`), donc `brice+foot@gmail.com` est refusée si
 * `brice@gmail.com` existe déjà : c'est la même boîte mail.
 */
export const EMAIL_ALREADY_USED_CODE = 'EMAIL_ALREADY_USED';

/**
 * Code stable pour le mobile : l'adresse existe mais n'a pas de mot de passe,
 * elle se connecte par Google. Révélé volontairement (l'utilisateur doit savoir
 * quoi faire) ; c'est le seul cas de login qui sort de l'erreur générique.
 */
export const ACCOUNT_IS_GOOGLE_CODE = 'ACCOUNT_IS_GOOGLE';

/**
 * Code stable pour le mobile : ce compte Google n'a aucune invitation de club,
 * il n'a donc rien à faire dans l'entrée entraîneur.
 */
export const COACH_NOT_INVITED_CODE = 'COACH_NOT_INVITED';

// Vue "qui suis-je" : lue depuis la DB (fraîche), jamais depuis le token.
export interface MeResponse {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  locale: Locale;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
}

const EMAIL_VERIFY_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;
// Plus long : l'entraîneur invité n'attend pas forcément cet email.
const COACH_INVITE_TTL_HOURS = 24 * 7;

// L'invitation entraîneur est un code à 6 chiffres, saisi à la main. C'est
// confortable, mais ça ne fait qu'un million de combinaisons : un jeton long
// est hors d'atteinte d'une force brute, celui-ci ne l'est pas. On brûle donc
// le code au bout de quelques essais ratés, et le club doit en renvoyer un.
const NUMERIC_CODE_LENGTH = 6;
const COACH_CODE_MAX_ATTEMPTS = 5;

/** Codes stables pour le mobile (le texte affiché reste côté app, en FR/DE). */
export const COACH_INVITE_INVALID_CODE = 'COACH_INVITE_INVALID';
export const COACH_INVITE_LOCKED_CODE = 'COACH_INVITE_LOCKED';
export const SIGNUP_CODE_INVALID = 'SIGNUP_CODE_INVALID';
export const SIGNUP_CODE_LOCKED = 'SIGNUP_CODE_LOCKED';

/**
 * Ce que l'app doit demander à l'entraîneur après son email :
 * - `CODE`     : invitation en attente, il doit saisir le code reçu ;
 * - `PASSWORD` : compte déjà activé, connexion normale ;
 * - `GOOGLE`   : compte activé via Google, il n'a pas de mot de passe ;
 * - `UNKNOWN`  : rien à cette adresse (ou invitation expirée).
 */
/**
 * Ce que l'app doit demander à l'entraîneur après sa saisie d'email.
 *
 * `NOT_A_COACH` : l'adresse a bien un compte, mais aucun club ne l'a enregistrée
 * comme entraîneur (un joueur, ou un responsable de club qui saisit sa propre
 * adresse). À distinguer d'`UNKNOWN`, qui couvre l'adresse sans compte du tout.
 */
export type CoachEntryStep = 'CODE' | 'PASSWORD' | 'GOOGLE' | 'NOT_A_COACH' | 'UNKNOWN';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly google: GoogleService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      // La comparaison se fait sur la forme normalisée de l'adresse (cf.
      // UsersService) : `brice+foot@gmail.com` tombe donc bien sur le compte
      // ouvert avec `brice@gmail.com`, au lieu d'en créer un second.
      throw new ConflictException({
        code: EMAIL_ALREADY_USED_CODE,
        message: 'An account with this email already exists.',
      });
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      email,
      passwordHash,
      locale: dto.locale ?? Locale.FR,
    });
    await this.sendVerification(user);
    return this.tokens.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.users.findByEmail(dto.email.toLowerCase());
    if (!user || !user.passwordHash) {
      // Compte SANS mot de passe mais AVEC Google : on le dit, sinon
      // l'utilisateur s'acharne sur un mot de passe qui n'existe pas. Un
      // compte sans mot de passe ET sans Google (inscription à moitié faite)
      // reste, lui, une erreur générique — rien à révéler.
      if (user?.googleId) {
        throw new UnauthorizedException({
          code: ACCOUNT_IS_GOOGLE_CODE,
          message: 'This account uses Google sign-in.',
        });
      }
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    return this.tokens.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { tokens } = await this.tokens.rotate(refreshToken);
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  // Statut de vérification lu en DB (le token ne le porte pas : il serait périmé).
  async me(userId: string): Promise<MeResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.passwordHash !== null,
      hasGoogle: user.googleId !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async googleSignIn(dto: GoogleSignInDto): Promise<AuthTokens> {
    const identity = await this.google.verify(dto.idToken);
    let user = await this.users.findByGoogleId(identity.googleId);
    if (!user) {
      const byEmail = await this.users.findByEmail(identity.email);
      user = byEmail
        ? await this.users.update(byEmail.id, {
            googleId: identity.googleId,
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
          })
        : await this.users.create({
            email: identity.email,
            googleId: identity.googleId,
            emailVerifiedAt: new Date(), // email Google déjà vérifié
            locale: Locale.FR,
          });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }
    return this.tokens.issueTokens(user);
  }

  /**
   * Entrée entraîneur par Google.
   *
   * Pourquoi un endpoint séparé de `/auth/google` : celui-ci **crée** un compte
   * quand l'adresse est inconnue, ce qui est juste pour un joueur mais faux
   * ici. Un entraîneur ne s'inscrit pas — son compte existe déjà, créé par son
   * club. Passer par `/auth/google` fabriquait donc un compte joueur vide pour
   * une adresse sans invitation, avant que l'app ne s'en aperçoive et le
   * déconnecte : un orphelin en base à chaque tentative.
   *
   * Ici l'ordre est inversé : on vérifie l'invitation **d'abord**, et on
   * n'écrit rien si elle manque.
   *
   * Révéler l'absence d'invitation ne fuite rien : le jeton Google prouve que
   * l'appelant possède cette boîte mail, il n'apprend donc qu'une chose sur
   * lui-même.
   */
  async googleCoachSignIn(dto: GoogleSignInDto): Promise<AuthTokens> {
    const identity = await this.google.verify(dto.idToken);

    // C'est l'ADRESSE qui identifie le compte : c'est elle que le club a saisie
    // en créant son entraîneur, bien avant qu'un jeton Google n'existe.
    const user = await this.users.findByEmail(identity.email);
    // Rôle COACH exigé, pas une appartenance quelconque : un responsable de
    // club n'est pas un entraîneur invité, il se connecte normalement.
    const membership = user
      ? await this.prisma.clubMember.findFirst({
          where: { userId: user.id, role: ClubMemberRole.COACH },
        })
      : null;

    if (!user || !membership) {
      throw new ForbiddenException({
        code: COACH_NOT_INVITED_CODE,
        message: 'No club invitation exists for this Google account.',
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }

    // Ce compte Google est-il déjà rattaché à un AUTRE compte FootLink ? Sans
    // ce contrôle, l'écriture ci-dessous violerait l'unicité de `googleId` et
    // partirait en 500.
    const linkedElsewhere = await this.users.findByGoogleId(identity.googleId);
    if (linkedElsewhere && linkedElsewhere.id !== user.id) {
      throw new ForbiddenException({
        code: COACH_NOT_INVITED_CODE,
        message: 'This Google account is already linked to another account.',
      });
    }

    // Google prouve la maîtrise de la boîte mail : l'email est validé du même
    // geste, exactement comme le code à 6 chiffres.
    const activated =
      user.googleId === identity.googleId && user.emailVerifiedAt !== null
        ? user
        : await this.users.update(user.id, {
            googleId: identity.googleId,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          });

    // L'invitation a rempli son office : on la brûle. La laisser vivante
    // laisserait un code à 6 chiffres utilisable sur un compte déjà activé.
    await this.prisma.token.updateMany({
      where: { userId: user.id, type: TokenType.COACH_INVITE, usedAt: null },
      data: { usedAt: new Date() },
    });

    return this.tokens.issueTokens(activated);
  }

  /**
   * Entrée club par Google.
   *
   * Encore un endpoint distinct de `/auth/google`, pour la raison inverse de
   * celle du coach : ici on veut bien **créer** un compte, mais **seulement**
   * s'il n'en existe aucun. Décision de Brice (25 juillet 2026) : le compte
   * d'un club est un compte à part, il ne se greffe pas sur un compte
   * personnel existant. `/auth/google` aurait connecté le compte joueur
   * existant, puis `requestClub` aurait basculé son `User.role` en CLUB_ADMIN
   * — un compte joueur transformé en compte club sans que personne ne l'ait
   * décidé.
   *
   * ⚠️ Conséquence acceptée : une adresse déjà inscrite est refusée
   * définitivement pour un club, y compris si son compte est vide parce que la
   * personne a abandonné ce parcours en cours de route. Débloquer demande une
   * suppression en base (aucune UI au MVP). Cf. HANDOFF décision 31.
   */
  async googleClubSignIn(dto: GoogleSignInDto): Promise<AuthTokens> {
    const identity = await this.google.verify(dto.idToken);

    // Les deux clés qui peuvent déjà désigner un compte : l'adresse, et le
    // compte Google lui-même (si l'adresse Google a changé depuis).
    const [byEmail, byGoogle] = await Promise.all([
      this.users.findByEmail(identity.email),
      this.users.findByGoogleId(identity.googleId),
    ]);
    if (byEmail || byGoogle) {
      throw new ConflictException({
        code: EMAIL_ALREADY_USED_CODE,
        message: 'An account with this email already exists.',
      });
    }

    // Adresse libre : on crée le compte. Google prouve la maîtrise de la boîte
    // mail, l'email est donc validé d'emblée.
    const user = await this.users.create({
      email: identity.email,
      googleId: identity.googleId,
      emailVerifiedAt: new Date(),
      locale: dto.locale ?? Locale.FR,
    });
    return this.tokens.issueTokens(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeToken(TokenType.EMAIL_VERIFY, token);
    await this.users.update(userId, { emailVerifiedAt: new Date() });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (user && !user.emailVerifiedAt) {
      await this.sendVerification(user);
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.users.findByEmail(dto.email.toLowerCase());
    // Réponse toujours identique (204) : pas d'énumération des comptes.
    if (user?.passwordHash) {
      const token = await this.createToken(TokenType.PASSWORD_RESET, user.id, PASSWORD_RESET_TTL_HOURS);
      await this.mail.sendPasswordResetEmail(user.email, token, user.locale);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const userId = await this.consumeToken(TokenType.PASSWORD_RESET, dto.token);
    const passwordHash = await argon2.hash(dto.password);
    await this.users.update(userId, { passwordHash });
    // Un reset invalide toutes les sessions existantes.
    await this.tokens.revokeAllForUser(userId);
  }

  /**
   * L'entraîneur s'inscrit avec l'email que son club a saisi et le code à
   * 6 chiffres reçu par email. Saisir le bon code prouve l'accès à la boîte
   * mail : le compte est activé ET l'email validé d'un seul geste.
   *
   * Les réponses ne disent jamais si l'email existe ou non : un compte inconnu
   * et un code faux renvoient exactement la même erreur, sinon l'endpoint
   * deviendrait un moyen d'énumérer les entraîneurs invités.
   */
  async acceptCoachInvite(dto: AcceptCoachInviteDto): Promise<AuthTokens> {
    const { user, invite } = await this.assertCoachCode(dto.email, dto.code);

    await this.prisma.token.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    const updated = await this.users.update(user.id, {
      passwordHash: await argon2.hash(dto.password),
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    });
    // Une invitation consommée invalide les sessions antérieures du compte.
    await this.tokens.revokeAllForUser(user.id);
    return this.tokens.issueTokens(updated);
  }

  /**
   * Vérifie le code SANS le consommer, pour que l'app puisse enchaîner sur le
   * choix du mot de passe. Faire saisir un mot de passe puis annoncer que le
   * code était faux serait une perte de temps gratuite.
   *
   * Le compteur de tentatives s'incrémente quand même : sans ça, cet endpoint
   * offrirait une force brute illimitée là où `accept` en compte cinq.
   */
  async verifyCoachCode(dto: AcceptCoachInviteDto | { email: string; code: string }): Promise<void> {
    await this.assertCoachCode(dto.email, dto.code);
  }

  /** Valide (email, code) ou lève. Ne modifie rien, hors compteur d'échecs. */
  private async assertCoachCode(
    rawEmail: string,
    rawCode: string,
  ): Promise<{ user: User; invite: { id: string } }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    const invite = user
      ? await this.prisma.token.findFirst({
          where: {
            userId: user.id,
            type: TokenType.COACH_INVITE,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (!user || !invite) {
      throw new BadRequestException({
        code: COACH_INVITE_INVALID_CODE,
        message: 'Invalid email or code.',
      });
    }
    if (invite.attempts >= COACH_CODE_MAX_ATTEMPTS) {
      // On préfère le dire plutôt que de laisser l'entraîneur retaper un code
      // définitivement mort. Ça révèle qu'une invitation existe, mais il aura
      // fallu brûler cinq essais pour l'apprendre.
      throw new BadRequestException({
        code: COACH_INVITE_LOCKED_CODE,
        message: 'Too many failed attempts. Ask your club to send a new code.',
      });
    }
    if (!(await argon2.verify(invite.tokenHash, rawCode.trim()))) {
      await this.prisma.token.update({
        where: { id: invite.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({
        code: COACH_INVITE_INVALID_CODE,
        message: 'Invalid email or code.',
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }
    return { user, invite };
  }

  /**
   * Dit à l'app quoi demander à l'entraîneur après sa saisie d'email : le code
   * d'activation, son mot de passe, ou de passer par Google.
   *
   * ⚠️ Cet endpoint révèle l'existence d'un compte pour une adresse donnée.
   * C'est un choix produit assumé : sans lui, impossible d'adapter l'écran, et
   * l'inscription fuit déjà la même information (409 sur email déjà pris). Il
   * est en contrepartie fortement rate-limité, et ne dit rien de plus que
   * l'étape suivante — ni nom, ni club, ni rôle.
   */
  async coachEntryStep(email: string): Promise<{ step: CoachEntryStep }> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { step: 'UNKNOWN' };
    }

    /*
     * Un entraîneur est un compte qu'un club a créé **en tant qu'entraîneur** :
     * on exige donc un `ClubMember` de rôle COACH, pas une appartenance
     * quelconque.
     *
     * Sans ce contrôle, n'importe quel compte existant était routé comme s'il
     * était l'entraîneur attendu. Un responsable de club qui saisissait sa
     * propre adresse ici s'entendait répondre « connecte-toi avec Google » —
     * réponse absurde, puisqu'aucun club ne l'a enregistré comme entraîneur.
     * Le rôle CLUB_ADMIN ne compte pas : un responsable qui entraîne aussi
     * passe par la connexion normale, pas par cette activation.
     *
     * Même principe que `googleCoachSignIn` (décision 27), à l'étape d'avant.
     */
    const coachMembership = await this.prisma.clubMember.findFirst({
      where: { userId: user.id, role: ClubMemberRole.COACH },
    });
    if (!coachMembership) {
      // Le compte existe, mais pas comme entraîneur : on le dit franchement
      // plutôt que d'envoyer la personne se battre avec un mot de passe. Ça ne
      // révèle rien de neuf — `POST /auth/register` répond déjà 409 sur une
      // adresse connue.
      return { step: 'NOT_A_COACH' };
    }

    if (user.passwordHash) {
      return { step: 'PASSWORD' };
    }
    if (user.googleId) {
      return { step: 'GOOGLE' };
    }
    // Ni mot de passe ni Google : le compte n'est utilisable que par une
    // invitation encore valide.
    const invite = await this.prisma.token.findFirst({
      where: {
        userId: user.id,
        type: TokenType.COACH_INVITE,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return { step: invite ? 'CODE' : 'UNKNOWN' };
  }

  /**
   * Renvoie un code d'activation à l'entraîneur lui-même, sans passer par son
   * club. Toujours silencieux : répondre différemment selon que l'adresse
   * existe transformerait l'endpoint en annuaire.
   */
  async resendCoachInvite(email: string): Promise<void> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    // Un compte déjà activé n'a rien à recevoir.
    if (!user || user.passwordHash || user.googleId || user.status !== UserStatus.ACTIVE) {
      return;
    }
    const member = await this.prisma.clubMember.findFirst({
      where: { userId: user.id },
      include: { club: true },
    });
    if (!member) {
      return;
    }
    const code = await this.createCoachInviteCode(user.id);
    await this.mail.sendCoachInviteEmail(
      user.email,
      member.firstName ?? '',
      member.club.name,
      code,
      user.locale,
    );
  }

  // Exposés pour les autres modules (ex. création de compte club en Phase 3).
  async sendEmailVerification(user: User): Promise<void> {
    await this.sendVerification(user);
  }

  /**
   * Code d'invitation entraîneur : 6 chiffres, tirés au sort de façon
   * cryptographique et stockés **hashés**. Le code en clair n'existe que dans
   * l'email. Émettre un nouveau code invalide les précédents, sinon un code
   * qu'on croyait remplacé resterait utilisable.
   */
  createCoachInviteCode(userId: string): Promise<string> {
    return this.createNumericCode(TokenType.COACH_INVITE, userId, COACH_INVITE_TTL_HOURS);
  }

  /**
   * Code numérique à usage unique, stocké **hashé**. Le code en clair n'existe
   * que dans l'email. Émettre un nouveau code invalide les précédents du même
   * type, sinon un code qu'on croyait remplacé resterait utilisable.
   */
  private async createNumericCode(
    type: TokenType,
    userId: string,
    ttlHours: number,
  ): Promise<string> {
    await this.prisma.token.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomInt(0, 10 ** NUMERIC_CODE_LENGTH)
      .toString()
      .padStart(NUMERIC_CODE_LENGTH, '0');
    await this.prisma.token.create({
      data: {
        type,
        userId,
        tokenHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
      },
    });
    return code;
  }

  /**
   * Inscription par email, première étape : on prouve l'adresse **avant** de
   * créer quoi que ce soit derrière (un club, par exemple).
   *
   * Un compte **déjà utilisable** (mot de passe ou Google) est signalé
   * explicitement — sinon l'app avançait vers l'écran du code, où aucun code
   * n'arrivait jamais : un cul-de-sac. C'est le seul cas révélé, et il équivaut
   * à ce qu'un utilisateur découvre de toute façon en essayant de se connecter.
   *
   * Pour tout le reste, on reste **muet** : un compte à moitié inscrit reçoit
   * son code, une adresse libre aussi, et rien ne distingue les deux. La
   * vérification du code (`verifySignupCode`) reste, elle, totalement
   * silencieuse (adresse inconnue et code faux = même erreur) — c'est là que
   * se joue l'anti-énumération de la décision 15, pas ici.
   */
  async requestSignupCode(dto: RequestSignupCodeDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);

    // Compte déjà utilisable : il doit se connecter, pas s'inscrire à nouveau.
    if (existing && (existing.passwordHash || existing.googleId)) {
      throw new ConflictException({
        code: EMAIL_ALREADY_USED_CODE,
        message: 'An account with this email already exists.',
      });
    }
    // Compte suspendu/désactivé : on ne relance pas d'inscription dessus, mais
    // on ne le dit pas non plus (ce n'est pas au demandeur de le savoir).
    if (existing && existing.status !== UserStatus.ACTIVE) {
      return;
    }

    const user =
      existing ??
      (await this.users.create({ email, locale: dto.locale ?? Locale.FR }));
    const code = await this.createNumericCode(
      TokenType.EMAIL_VERIFY,
      user.id,
      EMAIL_VERIFY_TTL_HOURS,
    );
    await this.mail.sendSignupCodeEmail(email, code, user.locale);
  }

  /**
   * Contrôle le code SANS le consommer, pour le valider dès sa saisie plutôt
   * qu'à la fin du parcours. Un code faux détecté seulement après l'écran du
   * mot de passe renvoyait l'utilisateur en arrière, tout à refaire — le flux
   * entraîneur évitait déjà ce piège avec `verifyCoachCode`, le flux
   * d'inscription le fait maintenant aussi.
   *
   * Compte les échecs comme la consommation : sinon on offrirait ici un banc
   * d'essai illimité pour deviner le code (le verrou à 5 essais ne servirait
   * plus à rien).
   */
  async checkSignupCode(dto: VerifyCoachCodeDto): Promise<void> {
    await this.assertSignupCode(dto.email, dto.code);
  }

  /**
   * Deuxième étape : le code prouve l'accès à la boîte mail, le mot de passe
   * rend le compte réutilisable. L'email est validé du même geste.
   */
  async verifySignupCode(dto: VerifySignupCodeDto): Promise<AuthTokens> {
    const { user, tokenId } = await this.assertSignupCode(dto.email, dto.code);

    await this.prisma.token.update({ where: { id: tokenId }, data: { usedAt: new Date() } });
    const updated = await this.users.update(user.id, {
      passwordHash: await argon2.hash(dto.password),
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    });
    await this.tokens.revokeAllForUser(user.id);
    return this.tokens.issueTokens(updated);
  }

  /**
   * Vérifie le code d'inscription et incrémente le compteur d'échecs, sans rien
   * consommer. Une seule copie de cette logique, partagée entre le contrôle et
   * la consommation : elles ne doivent jamais diverger (mêmes erreurs, même
   * verrou). Message identique pour un email inconnu et un code faux : on ne
   * dit jamais si l'adresse existe.
   */
  private async assertSignupCode(
    rawEmail: string,
    rawCode: string,
  ): Promise<{ user: User; tokenId: string }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    const token = user
      ? await this.prisma.token.findFirst({
          where: {
            userId: user.id,
            type: TokenType.EMAIL_VERIFY,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (!user || !token) {
      throw new BadRequestException({ code: SIGNUP_CODE_INVALID, message: 'Invalid email or code.' });
    }
    if (token.attempts >= COACH_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: SIGNUP_CODE_LOCKED,
        message: 'Too many failed attempts. Request a new code.',
      });
    }
    if (!(await argon2.verify(token.tokenHash, rawCode.trim()))) {
      await this.prisma.token.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({ code: SIGNUP_CODE_INVALID, message: 'Invalid email or code.' });
    }

    return { user, tokenId: token.id };
  }

  issueTokensForUser(user: Pick<User, 'id' | 'role' | 'email'>): Promise<AuthTokens> {
    return this.tokens.issueTokens(user);
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.createToken(TokenType.EMAIL_VERIFY, user.id, EMAIL_VERIFY_TTL_HOURS);
    await this.mail.sendVerificationEmail(user.email, token, user.locale);
  }

  // Jetons email (Token table) : "<id>.<secret>", hash argon2 stocké, usage unique.
  private async createToken(type: TokenType, userId: string, hours: number): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const record = await this.prisma.token.create({
      data: {
        type,
        userId,
        tokenHash: await argon2.hash(secret),
        expiresAt: new Date(Date.now() + hours * 3600 * 1000),
      },
    });
    return `${record.id}.${secret}`;
  }

  private async consumeToken(type: TokenType, presented: string): Promise<string> {
    const parsed = splitToken(presented);
    if (!parsed) {
      throw new BadRequestException('Invalid token.');
    }
    const record = await this.prisma.token.findUnique({ where: { id: parsed.id } });
    if (
      !record ||
      record.type !== type ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now() ||
      !(await argon2.verify(record.tokenHash, parsed.secret))
    ) {
      throw new BadRequestException('Invalid or expired token.');
    }
    await this.prisma.token.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return record.userId;
  }
}
