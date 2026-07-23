import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Locale, TokenType, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { splitToken } from '../common/utils/token.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  ForgotPasswordDto,
  GoogleSignInDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { GoogleService } from './google.service';
import { AuthTokens, TokenService } from './token.service';

const EMAIL_VERIFY_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

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
      throw new ConflictException('Un compte existe déjà avec cet email.');
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
      throw new UnauthorizedException('Identifiants invalides.');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Compte inactif.');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides.');
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
      throw new ForbiddenException('Compte inactif.');
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
      throw new BadRequestException('Jeton invalide.');
    }
    const record = await this.prisma.token.findUnique({ where: { id: parsed.id } });
    if (
      !record ||
      record.type !== type ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now() ||
      !(await argon2.verify(record.tokenHash, parsed.secret))
    ) {
      throw new BadRequestException('Jeton invalide ou expiré.');
    }
    await this.prisma.token.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return record.userId;
  }
}
