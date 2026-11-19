/** 초안 생성 모듈. Claude 호출부는 DRAFT_LLM 토큰으로 주입한다. */
import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { ClaudeDraftLlm, DRAFT_LLM } from './draft-llm';
import { DraftController } from './draft.controller';
import { DraftService } from './draft.service';

@Module({
  imports: [YoutubeModule, RulesModule],
  controllers: [DraftController],
  providers: [DraftService, { provide: DRAFT_LLM, useClass: ClaudeDraftLlm }],
})
export class DraftModule {}
