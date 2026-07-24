import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { ALLOW_UNVERIFIED_KEY } from '../../common/decorators/allow-unverified.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

// Codes stables pour le mobile : ils pilotent la redirection d'écran, le texte
// affiché reste côté app (i18n FR/DE).
export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';
export const ACCOUNT_NOT_ACTIVE_CODE = 'ACCOUNT_NOT_ACTIVE';

// Guard global : tant que l'email n'est pas validé, l'app ne peut RIEN faire.
//
// L'état est relu en base à chaque requête, jamais depuis le token : un access
// token émis avant la validation resterait sinon bloquant jusqu'à son expiration
// (et, symétriquement, une suspension ne prendrait effet qu'au refresh suivant).
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const authUser = request.user;
    if (!authUser) {
      throw new UnauthorizedException('Authentication required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { status: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ACCOUNT_NOT_ACTIVE_CODE,
        message: 'Account is not active.',
      });
    }
    if (user.emailVerifiedAt === null) {
      throw new ForbiddenException({
        code: EMAIL_NOT_VERIFIED_CODE,
        message: 'Email address must be verified before using the app.',
      });
    }
    return true;
  }
}
