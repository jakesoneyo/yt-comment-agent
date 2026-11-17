/** 운영 규칙 모듈. 컨트롤러는 Posting 단계에서 붙인다. */
import { Module } from '@nestjs/common';
import { RulesService } from './rules.service';

@Module({ providers: [RulesService], exports: [RulesService] })
export class RulesModule {}
