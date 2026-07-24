import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // API versionnée : /api/v1/...
  // `l/:action` est exclu : c'est la page de rebond des liens d'email, une URL
  // que des humains voient et partagent. Elle doit rester courte et stable,
  // donc ni préfixée ni versionnée.
  app.setGlobalPrefix('api', { exclude: ['l/:action'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation stricte des entrées (sécurité : rejet des champs inconnus)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = config.get<string[]>('corsOrigins') ?? ['*'];
  app.enableCors({ origin: origins.includes('*') ? true : origins, credentials: true });

  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`FootLink API prête → http://localhost:${port}/api/v1`);
}

void bootstrap();
