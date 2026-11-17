/** RulesService 통합 테스트: 모킹 없이 임시 SQLite 파일 DB(prisma db push)로 영상당 1개·하루 상한·KST 경계를 검증. */
import { ConflictException, HttpException } from '@nestjs/common';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { COMMENT_STATUS } from './comment-status';
import { kstDayStart, RulesService } from './rules.service';

const config: AppConfig = {
  profiles: [
    { name: 'A', dir: './a', persona: '' },
    { name: 'B', dir: './b', persona: '' },
    { name: 'C', dir: './c', persona: '' },
  ],
  comment: { min_chars: 40, max_chars: 120, brand: '운명원' },
  limits: { daily_max_comments: 10 },
  sources: { keywords: [], channels: [], max_results: 12 },
};

let dir: string;
let prisma: PrismaService;
let rules: RulesService;

const NOW = new Date('2026-11-18T03:00:00Z'); // 11/18 12:00 KST
const req = (videoId: string, profileName = 'A') => ({
  videoId,
  videoTitle: `t-${videoId}`,
  profileName,
  text: '댓글',
});

/** 오늘 집계에 잡히도록 createdAt을 지정해 로그를 직접 심는다 */
async function seed(
  n: number,
  createdAt: Date,
  status: string = COMMENT_STATUS.POSTED,
  profileName = 'A',
) {
  for (let i = 0; i < n; i++) {
    await prisma.commentLog.create({
      data: {
        videoId: `seed-${createdAt.getTime()}-${profileName}-${status}-${i}`,
        videoTitle: 's',
        profileName,
        text: 's',
        status,
        createdAt,
      },
    });
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rules-test-'));
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  execSync('npx prisma db push --skip-generate', {
    env: process.env,
    stdio: 'pipe',
  });
  prisma = new PrismaService();
  rules = new RulesService(prisma, config);
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.videoLock.deleteMany();
  await prisma.commentLog.deleteMany();
});

describe('kstDayStart', () => {
  it('KST 자정을 UTC로 반환', () => {
    expect(kstDayStart(new Date('2026-11-18T14:59:00Z')).toISOString()).toBe(
      '2026-11-17T15:00:00.000Z',
    );
    expect(kstDayStart(new Date('2026-11-18T15:00:00Z')).toISOString()).toBe(
      '2026-11-18T15:00:00.000Z',
    );
  });
});

describe('reserve', () => {
  it('1) 정상 예약 시 lock과 log(opening)가 생긴다', async () => {
    const log = await rules.reserve(req('v1'), NOW);
    expect(log.status).toBe('opening');
    const lock = await prisma.videoLock.findUnique({
      where: { videoId: 'v1' },
    });
    expect(lock?.commentLogId).toBe(log.id);
  });

  it('2) 이미 게시된 영상은 409', async () => {
    const log = await rules.reserve(req('v1'), NOW);
    await rules.succeed(log.id, 'https://youtube.com/watch?v=v1&lc=x');
    await expect(rules.reserve(req('v1'), NOW)).rejects.toThrow(
      '이미 댓글을 단 영상입니다',
    );
    await expect(rules.reserve(req('v1'), NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('3) 진행 중(lock 존재) 영상은 409', async () => {
    await rules.reserve(req('v1'), NOW);
    await expect(rules.reserve(req('v1'), NOW)).rejects.toThrow('진행 중');
  });

  it('4) fail 후 같은 영상 재예약 성공', async () => {
    const log = await rules.reserve(req('v1'), NOW);
    await rules.fail(log.id, '로그인 필요', 'screenshots/1.png');
    expect(
      await prisma.videoLock.findUnique({ where: { videoId: 'v1' } }),
    ).toBeNull();
    const failed = await prisma.commentLog.findUniqueOrThrow({
      where: { id: log.id },
    });
    expect(failed).toMatchObject({
      status: 'failed',
      error: '로그인 필요',
      screenshotPath: 'screenshots/1.png',
    });
    await expect(rules.reserve(req('v1'), NOW)).resolves.toMatchObject({
      status: 'opening',
    });
  });

  it('5) 오늘 non-failed 10건이면 11번째는 429', async () => {
    await seed(10, NOW);
    const err = await rules
      .reserve(req('new'), NOW)
      .catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).message).toBe('오늘 게시 상한 도달 (10/10)');
  });

  it('6) failed 건은 상한에 포함하지 않는다', async () => {
    await seed(9, NOW);
    await seed(5, NOW, COMMENT_STATUS.FAILED);
    await expect(rules.reserve(req('new'), NOW)).resolves.toBeDefined();
    await expect(rules.reserve(req('new2'), NOW)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('7) KST 경계: 23:59 KST의 10건은 00:00 KST에 새 하루로 계산', async () => {
    await seed(10, new Date('2026-11-18T14:59:00Z'));
    await expect(
      rules.reserve(req('v-late'), new Date('2026-11-18T14:59:30Z')),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      rules.reserve(req('v-next'), new Date('2026-11-18T15:00:00Z')),
    ).resolves.toBeDefined();
  });

  it('7b) 15:30Z(=11/19 00:30 KST) 기록은 11/19로 집계', async () => {
    await seed(1, new Date('2026-11-18T15:30:00Z'));
    expect(
      (await rules.todayStats(new Date('2026-11-18T16:00:00Z'))).used,
    ).toBe(1);
    expect(
      (await rules.todayStats(new Date('2026-11-18T14:00:00Z'))).used,
    ).toBe(0);
  });

  it('8) 같은 영상 동시 reserve 2건 중 정확히 1건만 성공', async () => {
    const results = await Promise.allSettled([
      rules.reserve(req('race'), NOW),
      rules.reserve(req('race', 'B'), NOW),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.commentLog.count({ where: { videoId: 'race' } })).toBe(
      1,
    );
  });

  it('8b) 서로 다른 영상 동시 reserve가 상한을 넘기지 않는다', async () => {
    await seed(9, NOW);
    const results = await Promise.allSettled([
      rules.reserve(req('x1'), NOW),
      rules.reserve(req('x2'), NOW),
      rules.reserve(req('x3'), NOW),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('pickProfile / todayStats', () => {
  it('9) 사용량 최소 프로필, 동률이면 config 첫 번째', async () => {
    expect(await rules.pickProfile(NOW)).toBe('A');
    await seed(2, NOW, COMMENT_STATUS.POSTED, 'A');
    await seed(1, NOW, COMMENT_STATUS.POSTED, 'B');
    expect(await rules.pickProfile(NOW)).toBe('C');
    await seed(1, NOW, COMMENT_STATUS.POSTED, 'C');
    expect(await rules.pickProfile(NOW)).toBe('B');
  });

  it('failed는 프로필 사용량에서 제외', async () => {
    await seed(3, NOW, COMMENT_STATUS.FAILED, 'A');
    await seed(1, NOW, COMMENT_STATUS.POSTED, 'B');
    expect(await rules.pickProfile(NOW)).toBe('A');
  });

  it('todayStats는 모든 프로필을 0 포함해 반환', async () => {
    await seed(2, NOW, COMMENT_STATUS.POSTED, 'B');
    expect(await rules.todayStats(NOW)).toEqual({
      used: 2,
      limit: 10,
      perProfile: { A: 0, B: 2, C: 0 },
    });
  });
});
