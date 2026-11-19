/** 댓글 게시 모듈(Playwright 실행기 포함). */
import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { PostingController } from './posting.controller';
import { PostingRunner } from './posting.runner';
import { PostingService } from './posting.service';

@Module({
  imports: [RulesModule, YoutubeModule],
  controllers: [PostingController],
  providers: [PostingService, PostingRunner],
})
export class PostingModule {}
