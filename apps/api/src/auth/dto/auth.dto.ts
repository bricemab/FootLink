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

// Première étape de l'entrée entraîneur : savoir quoi lui demander ensuite.
export class CoachEmailDto {
  @IsEmail()
  email!: string;
}

// Inscription par email : on prouve l'adresse AVANT de créer quoi que ce soit.
export class RequestSignupCodeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

export class VerifySignupCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be exactly 6 digits.' })
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;
}

// Invitation entraîneur : le club a créé le compte et saisi l'email ; l'invité
// prouve qu'il y a accès en recopiant le code à 6 chiffres reçu, et choisit son
// mot de passe dans la foulée.
export class VerifyCoachCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be exactly 6 digits.' })
  code!: string;
}

export class AcceptCoachInviteDto extends VerifyCoachCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;
}
