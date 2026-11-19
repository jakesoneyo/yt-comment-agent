/** 루트 모듈. 설정·DB·운영 규칙 위에 YouTube(영상·자막)·Draft(초안)·Posting(게시) 모듈을 조립한다. */
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DraftModule } from './draft/draft.module';
import { HealthController } from './health/health.controller';
import { PostingModule } from './posting/posting.module';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RulesModule,
    YoutubeModule,
    DraftModule,
    PostingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
