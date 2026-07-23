import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

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
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Variables d'environnement invalides :\n${errors.toString()}`);
  }
  return validated;
}
