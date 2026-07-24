import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowUnverified } from '../common/decorators/allow-unverified.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, MeResponse } from './auth.service';
import {
  AcceptCoachInviteDto,
  ForgotPasswordDto,
  GoogleSignInDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { AuthTokens } from './token.service';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  // Se déconnecter doit rester possible même avec un email non validé.
  @AllowUnverified()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  google(@Body() dto: GoogleSignInDto): Promise<AuthTokens> {
    return this.auth.googleSignIn(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ verified: boolean }> {
    await this.auth.verifyEmail(dto.token);
    return { verified: true };
  }

  // Redemander l'email de validation : c'est justement la sortie de l'état bloqué.
  @AllowUnverified()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendVerification(user.userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  // Le compte entraîneur est créé par le club sans mot de passe : l'invité le
  // définit ici. Accepter l'invitation prouve l'accès à la boîte mail -> email validé.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('coach-invite/accept')
  acceptCoachInvite(@Body() dto: AcceptCoachInviteDto): Promise<AuthTokens> {
    return this.auth.acceptCoachInvite(dto);
  }

  // Doit rester lisible sans email validé : l'app s'en sert pour savoir
  // qu'elle doit afficher l'écran de validation (emailVerified: false).
  @AllowUnverified()
  @Get('me')
  me(@CurrentUser('userId') userId: string): Promise<MeResponse> {
    return this.auth.me(userId);
  }
}
