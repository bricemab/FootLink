import { Module } from '@nestjs/common';
import { AppConfigController } from './app-config.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [AppConfigController, HealthController],
})
export class AppConfigModule {}
