/**
 * 초안 생성 파이프라인: 맥락 수집 → Claude 1회 호출 → 검증기 → (실패 시 위반 사유를 붙여 재호출, 총 3회) → Draft 저장.
 * 규칙 강제는 프롬프트가 아니라 validateComment가 한다.
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Draft } from '@prisma/client';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import {
  validateComment,
  type ValidationResult,
} from '../validator/comment-validator';
import { YoutubeService } from '../youtube/youtube.service';
import { DRAFT_LLM, type DraftLlm } from './draft-llm';
import {
  buildRetryPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  type DraftOutput,
} from './prompt';

export const MAX_ATTEMPTS = 3;

export type ValidationRecord = ValidationResult & { attempts: number };

export interface DraftResponse extends Omit<Draft, 'evidence' | 'validation'> {
  evidence: DraftOutput['evidence'];
  validation: ValidationRecord;
  viewer_tone: string;
}

@Injectable()
export class DraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YoutubeService,
    private readonly rules: RulesService,
    @Inject(DRAFT_LLM) private readonly llm: DraftLlm,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * 초안을 만든다. 3회 모두 검증에 실패해도 마지막 결과를 ok:false로 저장해 돌려준다
   * (화면에서 사람이 고치도록 — 에러로 버리면 작업이 사라진다).
   * @throws BadRequestException 없는 프로필명. 영상 404·외부 API 502는 하위 서비스에서 전파
   */
  async generate(
    videoId: string,
    profileName?: string,
  ): Promise<DraftResponse> {
    const name = profileName ?? (await this.rules.pickProfile());
    const profile = this.config.profiles.find((p) => p.name === name);
    if (!profile) throw new BadRequestException(`알 수 없는 프로필: ${name}`);

    const ctx = await this.youtube.getContext(videoId);
    const recentComments = await this.rules.recentComments();
    const { min_chars, max_chars, brand } = this.config.comment;

    const system = buildSystemPrompt({
      brand,
      minChars: min_chars,
      maxChars: max_chars,
      persona: profile.persona,
    });
    const baseUser = buildUserPrompt({
      brand,
      minChars: min_chars,
      maxChars: max_chars,
      persona: profile.persona,
      title: ctx.title,
      channelTitle: ctx.channelTitle,
      description: ctx.description,
      transcript: ctx.transcript,
      topComments: ctx.topComments,
      recentComments,
    });

    let user = baseUser;
    let out!: DraftOutput;
    let result!: ValidationResult;
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      out = await this.llm.generate(system, user);
      result = validateComment(out.comment, {
        minChars: min_chars,
        maxChars: max_chars,
        brand,
        evidenceKeywords: out.evidence.map((e) => e.keyword),
        recentComments,
      });
      if (result.ok) break;
      user = `${baseUser}\n\n${buildRetryPrompt(out.comment, result.violations)}`;
    }

    const validation: ValidationRecord = { ...result, attempts };
    const draft = await this.prisma.draft.create({
      data: {
        videoId,
        profileName: name,
        concern: out.concern,
        evidence: JSON.stringify(out.evidence),
        comment: out.comment,
        validation: JSON.stringify(validation),
      },
    });
    return {
      ...draft,
      evidence: out.evidence,
      validation,
      viewer_tone: out.viewer_tone,
    };
  }
}
