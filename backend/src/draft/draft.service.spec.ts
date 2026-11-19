/** DraftService 단위 테스트: Claude·YouTube·DB를 가짜로 교체해 재시도 루프(1회 통과/2회째 통과/3회 실패)를 검증. */
import { BadRequestException } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { DraftService } from './draft.service';
import type { DraftOutput } from './prompt';

const config: AppConfig = {
  profiles: [{ name: 'P1', dir: './p1', persona: '24살 대학생' }],
  comment: { min_chars: 20, max_chars: 120, brand: '운명원' },
  limits: { daily_max_comments: 10 },
  sources: { keywords: [], channels: [], max_results: 12 },
};

const GOOD =
  '답장 텀 얘기 너무 공감돼요 저도 그런 적 있어서 결국 인연이 따로 있나 싶네요 운명원 연애사주 잘 본다던데 나도 보고 싶다';
const out = (comment: string): DraftOutput => ({
  concern: '연락 텀',
  evidence: [{ ts: '00:03', quote: '답장은 세 시간째', keyword: '답장 텀' }],
  viewer_tone: '반말',
  comment,
});

function setup(comments: string[]) {
  const generate = jest.fn<Promise<DraftOutput>, [string, string]>();
  comments.forEach((c) => generate.mockResolvedValueOnce(out(c)));
  const create = jest.fn((args: { data: Record<string, string> }) =>
    Promise.resolve({ id: 1, createdAt: new Date(), ...args.data }),
  );
  const svc = new DraftService(
    { draft: { create } } as never,
    {
      getContext: jest.fn().mockResolvedValue({
        videoId: 'v',
        title: '제목',
        channelTitle: '채널',
        description: '',
        topComments: [],
        transcript: ['[00:03] 답장은 세 시간째'],
      }),
    } as never,
    {
      pickProfile: jest.fn().mockResolvedValue('P1'),
      recentComments: jest.fn().mockResolvedValue([]),
    } as never,
    { generate },
    config,
  );
  return { svc, generate, create };
}

describe('DraftService.generate', () => {
  it('1회째 통과하면 attempts=1로 저장', async () => {
    const { svc, generate, create } = setup([GOOD]);
    const res = await svc.generate('v');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(res.validation).toEqual({
      ok: true,
      violations: [],
      failed: [],
      attempts: 1,
    });
    expect(res.profileName).toBe('P1');
    expect(res.viewer_tone).toBe('반말');
    expect(
      (
        JSON.parse(create.mock.calls[0][0].data.evidence) as {
          keyword: string;
        }[]
      )[0].keyword,
    ).toBe('답장 텀');
  });

  it('2회째 통과: 재시도 프롬프트에 이전 댓글과 위반문이 들어간다', async () => {
    const { svc, generate } = setup(['너무 짧음', GOOD]);
    const res = await svc.generate('v', 'P1');
    expect(generate).toHaveBeenCalledTimes(2);
    const retryUser: string = generate.mock.calls[1][1];
    expect(retryUser).toContain('이전 댓글: 너무 짧음');
    expect(retryUser).toContain('20~120글자');
    expect(res.comment).toBe(GOOD);
    expect(res.validation.attempts).toBe(2);
    expect(res.validation.ok).toBe(true);
  });

  it('3회 모두 실패해도 마지막 결과를 ok:false로 저장해 반환', async () => {
    const { svc, generate, create } = setup(['실패1', '실패2', '실패3']);
    const res = await svc.generate('v');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(res.comment).toBe('실패3');
    expect(res.validation.ok).toBe(false);
    expect(res.validation.attempts).toBe(3);
    expect(
      (JSON.parse(create.mock.calls[0][0].data.validation) as { ok: boolean })
        .ok,
    ).toBe(false);
  });

  it('없는 프로필명은 400', async () => {
    const { svc, generate } = setup([]);
    await expect(svc.generate('v', 'nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
