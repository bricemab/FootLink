import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Public : sonde de santé (LB / monitoring). Vérifie la connexion DB.
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; db: string; ts: string }> {
    let db = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      ts: new Date().toISOString(),
    };
  }
}
