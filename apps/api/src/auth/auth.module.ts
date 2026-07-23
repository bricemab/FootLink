import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, GoogleService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
