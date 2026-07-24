import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

// Autorise une route authentifiée à rester accessible tant que l'email n'est pas
// validé. Réservé aux routes qui servent JUSTEMENT à sortir de cet état
// (consulter son statut, redemander l'email, se déconnecter).
// Toute autre route est bloquée par l'EmailVerifiedGuard global.
export const AllowUnverified = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_UNVERIFIED_KEY, true);
