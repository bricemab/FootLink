import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [TeamsModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
