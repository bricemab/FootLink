import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { EmailVerifiedGuard } from './auth/guards/email-verified.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ClubsModule } from './clubs/clubs.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { MailModule } from './mail/mail.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { PlayersModule } from './players/players.module';
import { PrismaModule } from './prisma/prisma.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Rate-limiting global (100 req / 60 s) ; endpoints d'auth plus stricts via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    UsersModule,
    MailModule,
    AuthModule,
    PlayersModule,
    ClubsModule,
    TeamsModule,
    AppConfigModule,
  ],
  providers: [
    // Ordre : rate-limit -> authentification -> email validé + compte actif -> rôle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
