/** YouTube Data API·자막 모듈. Draft/Posting이 영상 정보를 얻을 때 YoutubeService를 가져다 쓴다. */
import { Module } from '@nestjs/common';
import { YoutubeController } from './youtube.controller';
import { YoutubeService } from './youtube.service';

@Module({
  controllers: [YoutubeController],
  providers: [YoutubeService],
  exports: [YoutubeService],
})
export class YoutubeModule {}
