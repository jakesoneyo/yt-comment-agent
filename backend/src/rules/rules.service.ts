/**
 * 운영 규칙: 영상당 댓글 1개, 하루 게시 상한, 프로필 자동 배정.
 * 규칙 검사와 자리 예약(VideoLock + CommentLog)을 한 트랜잭션에 묶어 버튼 연타/동시 요청에도 중복 게시를 막는다.
 */
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CommentLog, Prisma } from '@prisma/client';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { COMMENT_STATUS, CommentStatus } from './comment-status';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "하루"의 시작(KST 00:00)을 UTC Date로 반환. 날짜 경계 계산은 반드시 이 함수만 사용한다.
 * KST는 DST가 없어 고정 오프셋(+9h)으로 충분 — 날짜 라이브러리 불필요.
 */
export function kstDayStart(now: Date): Date {
  const kstMs = now.getTime() + KST_OFFSET_MS;
  return new Date(
    kstMs - (((kstMs % DAY_MS) + DAY_MS) % DAY_MS) - KST_OFFSET_MS,
  );
}

export interface ReserveInput {
  videoId: string;
  videoTitle: string;
  profileName: string;
  text: string;
}

@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private todayWhere(now: Date): Prisma.CommentLogWhereInput {
    const start = kstDayStart(now);
    return {
      status: { not: COMMENT_STATUS.FAILED },
      createdAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
    };
  }

  /**
   * 게시 자리를 예약한다. 검사(영상 중복 → 하루 상한)와 생성이 한 트랜잭션이라 SQLite 쓰기 직렬화로 경쟁 상태가 없다.
   * @throws ConflictException 이미 댓글을 단/진행 중인 영상
   * @throws HttpException(429) 오늘 상한 도달
   */
  async reserve(input: ReserveInput, now = new Date()): Promise<CommentLog> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lock = await tx.videoLock.findUnique({
          where: { videoId: input.videoId },
        });
        if (lock)
          throw this.lockConflict(
            await tx.commentLog.findUnique({
              where: { id: lock.commentLogId },
            }),
          );

        const used = await tx.commentLog.count({ where: this.todayWhere(now) });
        const limit = this.config.limits.daily_max_comments;
        if (used >= limit) {
          throw new HttpException(
            `오늘 게시 상한 도달 (${used}/${limit})`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        // createdAt에 now를 넣어 "오늘" 집계 기준과 항상 같은 시계를 쓴다
        const log = await tx.commentLog.create({
          data: { ...input, status: COMMENT_STATUS.OPENING, createdAt: now },
        });
        await tx.videoLock.create({
          data: { videoId: input.videoId, commentLogId: log.id },
        });
        return log;
      });
    } catch (e) {
      // 동시 요청이 findUnique를 모두 통과해도 PK 제약이 최후 방어선
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('이미 진행 중인 영상입니다');
      }
      throw e;
    }
  }

  private lockConflict(owner: CommentLog | null): ConflictException {
    return new ConflictException(
      owner?.status === COMMENT_STATUS.POSTED ||
        owner?.status === COMMENT_STATUS.UNVERIFIED
        ? '이미 댓글을 단 영상입니다'
        : '이미 진행 중인 영상입니다',
    );
  }

  /** 진행 단계 갱신(opening→typing→…). 부가 정보(commentUrl 등)는 extra로 함께 저장. */
  markStatus(
    logId: number,
    status: CommentStatus,
    extra: {
      commentUrl?: string;
      error?: string;
      screenshotPath?: string;
    } = {},
  ): Promise<CommentLog> {
    return this.prisma.commentLog.update({
      where: { id: logId },
      data: { status, ...extra },
    });
  }

  /** 실패 처리 + VideoLock 해제. 락을 풀어야 같은 영상 재시도가 가능하고, failed 건은 상한에서도 빠진다. */
  async fail(
    logId: number,
    error: string,
    screenshotPath?: string,
  ): Promise<CommentLog> {
    const [log] = await this.prisma.$transaction([
      this.prisma.commentLog.update({
        where: { id: logId },
        data: { status: COMMENT_STATUS.FAILED, error, screenshotPath },
      }),
      this.prisma.videoLock.deleteMany({ where: { commentLogId: logId } }),
    ]);
    return log;
  }

  /**
   * 게시 버튼을 누른 뒤의 실패. 댓글이 실제로 달렸을 수 있으므로 락을 풀지 않는다
   * (풀면 재시도 시 같은 영상에 중복 게시될 위험). status가 failed가 아니라 상한에도 포함된다.
   */
  unverified(
    logId: number,
    error: string,
    screenshotPath?: string,
  ): Promise<CommentLog> {
    return this.markStatus(logId, COMMENT_STATUS.UNVERIFIED, {
      error,
      screenshotPath,
    });
  }

  /**
   * 서버 기동 시 1회: 이전 프로세스가 게시 도중 꺼져 진행 상태로 남은 기록을 정리한다.
   * 제출 전(opening·typing)은 failed+락 해제, 제출 후(posting·verifying)는 unverified+락 유지.
   */
  async recoverInterrupted(): Promise<void> {
    const msg = '서버가 게시 도중 종료되었습니다';
    const before = await this.prisma.commentLog.findMany({
      where: {
        status: { in: [COMMENT_STATUS.OPENING, COMMENT_STATUS.TYPING] },
      },
      select: { id: true },
    });
    for (const { id } of before) await this.fail(id, msg);
    await this.prisma.commentLog.updateMany({
      where: {
        status: { in: [COMMENT_STATUS.POSTING, COMMENT_STATUS.VERIFYING] },
      },
      data: {
        status: COMMENT_STATUS.UNVERIFIED,
        error: `${msg} (게시됐을 수 있음, 영상에서 직접 확인 필요)`,
      },
    });
  }

  /** 게시 성공. VideoLock은 지우지 않고 영구 유지해 영상당 1개를 보장한다. */
  succeed(logId: number, commentUrl: string): Promise<CommentLog> {
    return this.markStatus(logId, COMMENT_STATUS.POSTED, { commentUrl });
  }

  /** 오늘 사용량이 가장 적은 프로필 이름. 동률이면 config 순서상 앞선 쪽(strict < 비교). */
  async pickProfile(now = new Date()): Promise<string> {
    const { perProfile } = await this.todayStats(now);
    let best = this.config.profiles[0].name;
    for (const { name } of this.config.profiles) {
      if (perProfile[name] < perProfile[best]) best = name;
    }
    return best;
  }

  /**
   * 유사도 검사용 최근 게시(실패 제외) 댓글 본문, 최신순. Draft가 아니라 게시 기록을 쓰는 이유:
   * 같은 영상을 재생성할 때 이전 초안과 비교되어 자기 자신에게 걸리는 문제를 막기 위함.
   */
  async recentComments(limit = 10): Promise<string[]> {
    const rows = await this.prisma.commentLog.findMany({
      where: { status: { not: COMMENT_STATUS.FAILED } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { text: true },
    });
    return rows.map((r) => r.text);
  }

  /** 대시보드 카운터용: 오늘 사용량·상한·프로필별 사용량(미사용 프로필은 0). */
  async todayStats(now = new Date()) {
    const groups = await this.prisma.commentLog.groupBy({
      by: ['profileName'],
      where: this.todayWhere(now),
      _count: { _all: true },
    });
    const perProfile = Object.fromEntries(
      this.config.profiles.map((p) => [p.name, 0]),
    );
    for (const g of groups) perProfile[g.profileName] = g._count._all;
    const used = groups.reduce((sum, g) => sum + g._count._all, 0);
    return { used, limit: this.config.limits.daily_max_comments, perProfile };
  }
}
