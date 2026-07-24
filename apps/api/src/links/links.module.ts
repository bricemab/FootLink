import { Global, Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

// Global : MailService en a besoin pour construire les URL des emails.
@Global()
@Module({
  controllers: [LinksController],
  providers: [LinksService],
  exports: [LinksService],
})
export class LinksModule {}
