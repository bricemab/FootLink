import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

// Utilisateur authentifié tel qu'injecté par la stratégie JWT.
export interface AuthUser {
  userId: string;
  role: UserRole;
  email: string;
}

type RequestWithUser = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);
