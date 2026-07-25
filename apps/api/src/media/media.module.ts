import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService],
  // Exporté : `/auth/me` doit pouvoir résoudre l'URL de lecture de l'avatar.
  exports: [MediaService],
})
export class MediaModule {}
