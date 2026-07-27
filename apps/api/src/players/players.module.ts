import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { MediaModule } from '../media/media.module';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

@Module({
  imports: [GeoModule, MediaModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
