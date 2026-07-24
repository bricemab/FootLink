import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

// Validation des variables d'environnement au démarrage : fail-fast si mal configuré.
class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  CORS_ORIGINS: string = '*';

  @IsOptional()
  @IsString()
  API_MIN_VERSION: string = '1.0.0';

  @IsOptional()
  @IsString()
  API_LATEST_VERSION: string = '1.0.0';

  // --- JWT (obligatoire, secrets forts) ---
  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL: number = 900;

  @IsOptional()
  @IsInt()
  @Min(3600)
  JWT_REFRESH_TTL: number = 2592000;

  // --- Google Sign-In (optionnel tant que non configuré) ---
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_IDS?: string;

  // --- Email (optionnel : sans SMTP, les emails sont logués) ---
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsInt()
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM_NAME?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
