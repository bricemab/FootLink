import { Locale } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Au moins une lettre et un chiffre.
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;
export const PASSWORD_MESSAGE =
  'Password must contain at least one letter and one digit.';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  refreshToken!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class GoogleSignInDto {
  @IsString()
  idToken!: string;
}
