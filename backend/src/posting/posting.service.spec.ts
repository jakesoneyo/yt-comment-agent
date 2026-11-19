/** PostingService 단위 테스트: 검증·락·예약·락 해제를 가짜 의존성으로 확인(브라우저는 띄우지 않음). */
import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { PostingService } from './posting.service';

const config: AppConfig = {
  profiles: [{ name: 'P1', dir: './p1', persona: '' }],
  comment: { min_chars: 20, max_chars: 120, brand: '운명원' },
  limits: { daily_max_comments: 10 },
  sources: { keywords: [], channels: [], max_results: 12 },
};
const GOOD =
  '답장 텀 얘기 너무 공감돼요 저도 그런 적 있어서 결국 인연이 따로 있나 싶네요 운명원 연애사주 잘 본다던데 나도 보고 싶다';
const dto = { videoId: 'o7sbcaTQqtU', profileName: 'P1', text: GOOD };

function setup(execute: () => Promise<void>) {
  const reserve = jest.fn().mockResolvedValue({ id: 7 });
  const runnerExecute = jest.fn(execute);
  const svc = new PostingService(
    {} as never,
    { recentComments: jest.fn().mockResolvedValue([]), reserve } as never,
    { resolve: jest.fn().mockResolvedValue({ title: '제목' }) } as never,
    { execute: runnerExecute } as never,
    config,
  );
  return { svc, reserve, runnerExecute };
}

describe('PostingService.start', () => {
  it('없는 프로필은 400, 예약하지 않는다', async () => {
    const { svc, reserve } = setup(() => Promise.resolve());
    await expect(
      svc.start({ ...dto, profileName: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('검증기 위반이면 400 + violations, 예약하지 않는다', async () => {
    const { svc, reserve } = setup(() => Promise.resolve());
    const err = await svc
      .start({ ...dto, text: '짧음' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      violations: string[];
    };
    expect(body.violations.length).toBeGreaterThan(0);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('logId를 즉시 반환하고 서버가 조회한 제목으로 예약한다', async () => {
    const { svc, reserve, runnerExecute } = setup(
      () => new Promise(() => undefined),
    );
    await expect(svc.start(dto)).resolves.toEqual({ logId: 7 });
    expect(reserve).toHaveBeenCalledWith({
      videoId: dto.videoId,
      videoTitle: '제목',
      profileName: 'P1',
      text: GOOD,
    });
    expect(runnerExecute).toHaveBeenCalledWith(
      expect.objectContaining({ logId: 7, profileDir: './p1' }),
    );
  });

  it('진행 중이면 409, 끝나면 락이 풀려 다시 가능', async () => {
    let finish!: () => void;
    const { svc } = setup(() => new Promise<void>((r) => (finish = r)));
    await svc.start(dto);
    await expect(svc.start(dto)).rejects.toBeInstanceOf(ConflictException);
    finish();
    await new Promise((r) => setImmediate(r));
    await expect(svc.start(dto)).resolves.toEqual({ logId: 7 });
  });

  it('예약 단계 예외(상한 429 등)는 전파하고 락을 풀어 둔다', async () => {
    const { svc, reserve } = setup(() => Promise.resolve());
    reserve.mockRejectedValueOnce(new HttpException('상한', 429));
    await expect(svc.start(dto)).rejects.toMatchObject({ status: 429 });
    await expect(svc.start(dto)).resolves.toEqual({ logId: 7 });
  });
});
