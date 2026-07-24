import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { isLinkAction, LinksService } from './links.service';

/**
 * Page de rebond des liens d'email. Hors versionnement `/api/v1` : c'est une
 * URL que des humains voient et partagent, elle doit rester courte et stable.
 */
@Public()
@Controller({ path: 'l', version: VERSION_NEUTRAL })
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get(':action')
  bounce(
    @Param('action') action: string,
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ): void {
    if (!isLinkAction(action)) {
      throw new BadRequestException('Unknown link action.');
    }
    response
      .status(200)
      .type('html')
      // Un jeton à usage unique n'a rien à faire dans un cache partagé.
      .setHeader('Cache-Control', 'no-store');
    response.send(this.links.renderBouncePage(action, token ?? ''));
  }
}
