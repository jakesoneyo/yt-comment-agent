/**
 * 게시 요청 접수: 입력·규칙 검증 → 단일 실행 락 → 자리 예약(RulesService) → 백그라운드 실행.
 * 요청은 logId만 즉시 돌려주고, 진행 상황은 CommentLog 상태를 폴링해서 본다.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { validateComment } from '../validator/comment-validator';
import { YoutubeService } from '../youtube/youtube.service';
import type { CreateCommentDto } from './posting.dto';
import { PostingRunner } from './posting.runner';

@Injectable()
export class PostingService {
  private readonly logger = new Logger(PostingService.name);
  // ponytail: 단일 프로세스 락, 다중 워커 필요 시 DB 락으로
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly youtube: YoutubeService,
    private readonly runner: PostingRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * 게시를 시작하고 logId를 즉시 반환한다.
   * @throws BadRequestException 없는 프로필 / 검증기 위반(violations 포함 — 프론트 수정본도 규칙을 통과해야 함)
   * @throws ConflictException 다른 댓글 게시 중, 이미 단 영상 / 429 오늘 상한(rules.reserve에서 전파)
   */
  async start(dto: CreateCommentDto): Promise<{ logId: number }> {
    const profile = this.config.profiles.find(
      (p) => p.name === dto.profileName,
    );
    if (!profile) {
      throw new BadRequestException(`알 수 없는 프로필: ${dto.profileName}`);
    }
    const { min_chars, max_chars, brand } = this.config.comment;
    // evidenceKeywords는 비움: 수정본에는 영상 근거 키워드 규칙을 요구하지 않는다
    const check = validateComment(dto.text, {
      minChars: min_chars,
      maxChars: max_chars,
      brand,
      evidenceKeywords: [],
      recentComments: await this.rules.recentComments(),
    });
    if (!check.ok) {
      throw new BadRequestException({
        message: '댓글이 검증 규칙을 통과하지 못했습니다',
        violations: check.violations,
      });
    }

    if (this.busy) {
      throw new ConflictException('다른 댓글을 게시하는 중입니다');
    }
    this.busy = true;
    try {
      const { title } = await this.youtube.resolve(dto.videoId);
      const log = await this.rules.reserve({
        videoId: dto.videoId,
        videoTitle: title,
        profileName: profile.name,
        text: dto.text,
      });
      // await 하지 않음: 브라우저 실행은 수십 초 걸리므로 백그라운드로 돌리고 끝나면 락 해제
      void this.runner
        .execute({
          logId: log.id,
          videoId: dto.videoId,
          text: dto.text,
          profileDir: profile.dir,
        })
        .catch((e) => this.logger.error(`게시 실행 예외 #${log.id}`, e))
        .finally(() => {
          this.busy = false;
        });
      return { logId: log.id };
    } catch (e) {
      this.busy = false;
      throw e;
    }
  }

  async get(id: number) {
    const log = await this.prisma.commentLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('게시 기록을 찾을 수 없습니다');
    return log;
  }

  list() {
    return this.prisma.commentLog.findMany({ orderBy: { createdAt: 'desc' } });
  }

  stats() {
    return this.rules.todayStats();
  }
}
