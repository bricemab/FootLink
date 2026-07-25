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

  // --- Stockage média S3 (Cloudflare R2) ---
  // Optionnels : sans eux, les uploads répondent 503 et le reste de l'app
  // fonctionne. Ce sont de VRAIS secrets, jamais commités ni logués.
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  // --- Mapbox (recherche de lieux ; sans lui, saisie manuelle) ---
  // Jeton PUBLIC (pk.…), conçu pour être exposé côté client. On le garde
  // néanmoins côté serveur : il n'est pas dans le binaire de l'app, donc le
  // faire tourner ne demande aucune mise à jour sur les stores.
  @IsOptional()
  @IsString()
  MAPBOX_TOKEN?: string;

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

  // --- Liens d'email (rebond vers l'app, repli sur les stores) ---
  @IsOptional()
  @IsString()
  PUBLIC_BASE_URL?: string;

  @IsOptional()
  @IsString()
  IOS_STORE_URL?: string;

  @IsOptional()
  @IsString()
  ANDROID_STORE_URL?: string;
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
