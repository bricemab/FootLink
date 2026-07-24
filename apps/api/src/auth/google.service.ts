import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
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
    };
  }
}
