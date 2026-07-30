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

/**
 * Fenetre pendant laquelle un jeton deja rotate peut etre rejoue SANS que ce
 * soit tenu pour un vol.
 *
 * 🔴 **Pourquoi elle existe.** La rotation revoque le jeton presente et en emet
 * un nouveau. Si la reponse se perd — reseau coupe a mi-chemin, application
 * mise en arriere-plan, processus tue — le serveur a rotate mais l'app n'a
 * jamais recu le successeur. A la tentative suivante, elle rejoue donc l'ancien
 * jeton, de parfaite bonne foi, et la detection de rejeu revoquait TOUTE la
 * famille : deconnexion d'un utilisateur qui n'avait rien fait de mal, et
 * impossible a diagnostiquer pour lui.
 *
 * ⚠️ **Ce que ca coute en securite : presque rien.** Un voleur qui detient un
 * refresh token n'a pas besoin de le rejouer — il s'en sert normalement. La
 * detection de rejeu ne le rattrape que s'il joue APRES le proprietaire ; on
 * reduit cette fenetre a une minute, au-dela de laquelle la revocation
 * complete s'applique comme avant. Le compromis est celui recommande par la
 * RFC 9700 (OAuth 2.0 Security BCP) pour exactement ce probleme.
 */
const REPLAY_GRACE_MS = 60_000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * `replacesId` : le jeton que celui-ci remplace. Renseigne uniquement lors
   * d'une rotation, pour que le predecesseur sache qui a pris sa suite — voir
   * `REPLAY_GRACE_MS`.
   */
  async issueTokens(user: TokenSubject, replacesId?: string): Promise<AuthTokens> {
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, email: user.email },
      { secret: this.config.getOrThrow<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    const refreshToken = await this.createRefreshToken(user.id, replacesId);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: accessTtl };
  }

  // Refresh token opaque : "<id>.<secret>". Seul le hash argon2 du secret est stocké.
  private async createRefreshToken(userId: string, replacesId?: string): Promise<string> {
    const secret = randomBytes(48).toString('base64url');
    const ttl = this.config.get<number>('jwt.refreshTtl') ?? 2592000;
    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: await argon2.hash(secret),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    if (replacesId !== undefined) {
      await this.prisma.refreshToken.update({
        where: { id: replacesId },
        data: { replacedById: record.id },
      });
    }
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
      record &&
      record.revokedAt !== null &&
      (await argon2.verify(record.tokenHash, parsed.secret))
    ) {
      /*
        Le secret presente VERIFIE contre le hash d'un jeton revoque : quelqu'un
        rejoue un ancien refresh. Deux lectures possibles, et il faut les
        separer.
      */
      const successor = record.replacedById
        ? await this.prisma.refreshToken.findUnique({
            where: { id: record.replacedById },
            include: { user: true },
          })
        : null;
      const age = Date.now() - record.revokedAt.getTime();

      /*
        **Reponse perdue en route.** La rotation vient d'avoir lieu, et le
        successeur n'a JAMAIS servi : personne d'autre ne s'est authentifie
        entre-temps. L'app rejoue donc l'ancien jeton parce qu'elle n'a pas recu
        le nouveau. On lui rend une paire valide au lieu de la deconnecter.

        La condition `successor.revokedAt === null` est essentielle : si le
        successeur a deja ete utilise, c'est qu'un autre porteur a poursuivi la
        chaine — et la, c'est bien un rejeu suspect.
      */
      if (
        age <= REPLAY_GRACE_MS &&
        successor &&
        successor.revokedAt === null &&
        successor.expiresAt.getTime() > Date.now() &&
        successor.user.status === UserStatus.ACTIVE
      ) {
        await this.prisma.refreshToken.update({
          where: { id: successor.id },
          data: { revokedAt: new Date() },
        });
        const tokens = await this.issueTokens(successor.user, successor.id);
        return { tokens, user: successor.user };
      }

      // Sinon : vol probable. On revoque toute la famille de jetons de
      // l'utilisateur (audit #10, « refresh token reuse detection »).
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
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
    const tokens = await this.issueTokens(record.user, record.id);
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
