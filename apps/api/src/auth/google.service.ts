import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  /**
   * Prénom et nom tels que Google les connaît, quand ils sont renseignés.
   *
   * Servent **uniquement** à préremplir l'onboarding : Google énonce un nom, il
   * ne le prouve pas. Ils restent donc modifiables et n'autorisent rien. Ils ne
   * sont pas non plus stockés — voir `AuthTokens.profileHints`.
   */
  givenName: string | null;
  familyName: string | null;
}

/** Un champ absent et un champ vide se valent : les deux ne préremplissent rien. */
function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class GoogleService {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(config: ConfigService) {
    this.audiences = config.get<string[]>('google.clientIds') ?? [];
  }

  // Vérifie la signature ET l'audience du jeton ID côté serveur (jamais de confiance au client).
  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.audiences.length === 0) {
      throw new InternalServerErrorException('Google Sign-In is not configured.');
    }
    const ticket = await this.client
      .verifyIdToken({ idToken, audience: this.audiences })
      .catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token.');
    }
    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      // `given_name` / `family_name` font partie du scope `profile`, inclus par
      // défaut dans le sign-in : aucun scope supplémentaire à demander. La date
      // de naissance, elle, n'est PAS dans le jeton — il faudrait la People API
      // avec le scope restreint `user.birthday.read` (validation Google), donc
      // l'année de naissance reste saisie à la main.
      givenName: trimToNull(payload.given_name),
      familyName: trimToNull(payload.family_name),
    };
  }
}
