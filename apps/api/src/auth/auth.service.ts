import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Locale, TokenType, User, UserRole, UserStatus } from '@prisma/client';
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
  ResetPasswordDto,
} from './dto/auth.dto';
import { GoogleService } from './google.service';
import { AuthTokens, TokenService } from './token.service';

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
const COACH_CODE_LENGTH = 6;
const COACH_CODE_MAX_ATTEMPTS = 5;

/** Codes stables pour le mobile (le texte affiché reste côté app, en FR/DE). */
export const COACH_INVITE_INVALID_CODE = 'COACH_INVITE_INVALID';
export const COACH_INVITE_LOCKED_CODE = 'COACH_INVITE_LOCKED';

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
      throw new ConflictException('An account with this email already exists.');
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
    // passwordHash null = compte Google uniquement -> pas de login par mot de passe.
    if (!user || !user.passwordHash) {
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
    const email = dto.email.trim().toLowerCase();
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
    if (!(await argon2.verify(invite.tokenHash, dto.code.trim()))) {
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
  async createCoachInviteCode(userId: string): Promise<string> {
    await this.prisma.token.updateMany({
      where: { userId, type: TokenType.COACH_INVITE, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomInt(0, 10 ** COACH_CODE_LENGTH)
      .toString()
      .padStart(COACH_CODE_LENGTH, '0');
    await this.prisma.token.create({
      data: {
        type: TokenType.COACH_INVITE,
        userId,
        tokenHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + COACH_INVITE_TTL_HOURS * 3600 * 1000),
      },
    });
    return code;
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
