import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Public : consulté au lancement de l'app mobile (gate de version minimale).
@Controller({ path: 'app/config', version: '1' })
export class AppConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getConfig(): { minVersion: string; latestVersion: string; maintenance: boolean } {
    return {
      minVersion: this.config.get<string>('version.min') ?? '1.0.0',
      latestVersion: this.config.get<string>('version.latest') ?? '1.0.0',
      maintenance: false,
    };
  }
}
