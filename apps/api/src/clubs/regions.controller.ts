import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ClubsService } from './clubs.service';

// Données de référence (associations régionales) : nécessaires avant connexion
// (formulaire de demande de club) -> public.
@Public()
@Controller({ path: 'regions', version: '1' })
export class RegionsController {
  constructor(private readonly clubs: ClubsService) {}

  @Get()
  list() {
    return this.clubs.listRegions();
  }
}
