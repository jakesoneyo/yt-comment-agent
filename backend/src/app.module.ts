/** 루트 모듈. YouTube·Draft·Posting 모듈은 이후 단계에서 추가. */
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [ConfigModule, PrismaModule, RulesModule, YoutubeModule],
  controllers: [HealthController],
})
export class AppModule {}
