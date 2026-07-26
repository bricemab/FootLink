import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Request, Response } from 'express';
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
  // « * » reflète n'importe quelle origine : toléré en dev, interdit en
  // production — fail-fast au bootstrap plutôt qu'une API grande ouverte (audit #3).
  if (origins.includes('*') && config.get<string>('nodeEnv') === 'production') {
    throw new Error('CORS_ORIGINS ne peut pas contenir « * » en production.');
  }
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    // L'auth passe par le header `Authorization: Bearer`, aucun cookie n'est
    // utilisé : les credentials cross-origin ne servent à rien et deviendraient
    // un risque le jour où un cookie serait introduit.
    credentials: false,
  });

  // Headers de sécurité posés à la main — pas de dépendance helmet (audit #12).
  // L'API ne sert que du JSON : CSP maximalement restrictive par défaut. Seule
  // la page de rebond des liens d'email (/l/…) est du HTML avec JS et styles
  // inline ; elle reçoit une CSP assouplie pour ce qu'elle utilise réellement.
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      req.path.startsWith('/l/')
        ? "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
        : "default-src 'none'",
    );
    next();
  });

  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`FootLink API prête → http://localhost:${port}/api/v1`);
}

void bootstrap();
