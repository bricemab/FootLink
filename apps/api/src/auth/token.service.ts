import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { splitToken } from '../common/utils/token.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Prénom et nom annoncés par le fournisseur d'identité, pour **préremplir** un
 * formulaire — jamais pour décider quoi que ce soit.
 *
 * Volontairement transportés dans la réponse d'authentification et **non
 * stockés** : ils ne servent qu'à l'onboarding qui suit immédiatement, et les
 * garder en base reviendrait à conserver des données personnelles dont le
 * fonctionnement n'a pas besoin (minimisation, AGENTS §10). Corollaire assumé :
 * si l'app redémarre avant l'onboarding, les champs sont simplement vides.
 */
export interface ProfileHints {
  firstName: string | null;
  lastName: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // durée de vie de l'access token (secondes)
  /** Présent seulement quand l'entrée par Google en a fourni. */
  profileHints?: ProfileHints;
}

type TokenSubject = Pick<User, 'id' | 'role' | 'email'>;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueTokens(user: TokenSubject): Promise<AuthTokens> {
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, email: user.email },
      { secret: this.config.getOrThrow<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: accessTtl };
  }

  // Refresh token opaque : "<id>.<secret>". Seul le hash argon2 du secret est stocké.
  private async createRefreshToken(userId: string): Promise<string> {
    const secret = randomBytes(48).toString('base64url');
    const ttl = this.config.get<number>('jwt.refreshTtl') ?? 2592000;
    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: await argon2.hash(secret),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return `${record.id}.${secret}`;
  }

  // Rotation : révoque le refresh présenté et en émet un nouveau (détection de rejeu).
  async rotate(presented: string): Promise<{ tokens: AuthTokens; user: TokenSubject }> {
    const parsed = splitToken(presented);
    if (!parsed) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: parsed.id },
      include: { user: true },
    });
    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() < Date.now() ||
      !(await argon2.verify(record.tokenHash, parsed.secret))
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    if (record.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await this.issueTokens(record.user);
    return { tokens, user: record.user };
  }

  async revoke(presented: string): Promise<void> {
    const parsed = splitToken(presented);
    if (!parsed) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { id: parsed.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
