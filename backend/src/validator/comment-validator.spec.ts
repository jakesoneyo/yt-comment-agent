import { validateComment, ValidateOptions } from './comment-validator';

const base: ValidateOptions = {
  minChars: 40,
  maxChars: 120,
  brand: '운명원',
  evidenceKeywords: ['남자심리'],
  recentComments: [],
};

/** 남자심리·운명원 1회씩 포함하는 통과용 문장을 정확히 n자로 맞춘다 */
function ofLength(n: number): string {
  const core =
    '남자심리 진짜 어렵다 ㅠㅠ 운명원 사주가 잘 본다던데 나도 보고 싶다';
  const pad = n - [...core].length;
  expect(pad).toBeGreaterThanOrEqual(0);
  return core + 'ㅋ'.repeat(pad);
}

const PDF_EXAMPLE =
  '근데 진짜 남자심리는 알다가도 모르겠다...ㅠㅠ 맨날 연애하면 차이기만 했던 1인. 결국 심리 알기는 개뿔 그냥 인연이면 만나는 것 같아요. 운명원 연애사주가 그렇게 잘 본다던데 나도 언제 짝 만나는지 한번 보고 싶다. 각자 정해진 운명이 있는 듯.';

describe('validateComment', () => {
  describe('길이 (코드포인트 기준)', () => {
    it.each([
      [39, false],
      [40, true],
      [120, true],
      [121, false],
    ])('%i자 -> ok=%s', (n, ok) => {
      const r = validateComment(ofLength(n), base);
      expect(r.ok).toBe(ok);
      if (!ok) expect(r.violations.join()).toContain('글자');
    });

    it('이모지 등은 1자로 센다', () => {
      expect(validateComment(ofLength(39).slice(0, -1) + '😀', base).ok).toBe(
        false,
      );
      expect(validateComment(ofLength(40).slice(0, -1) + '😀', base).ok).toBe(
        true,
      );
    });
  });

  describe('URL·해시태그', () => {
    const t = ofLength(60);
    it('통과: 링크 없음', () => expect(validateComment(t, base).ok).toBe(true));
    it.each(['http://a', 'www.a', 'a.com', 'a.kr', 'youtu.be/x', '#연애'])(
      '거부: %s',
      (bad) => {
        const r = validateComment(`${t} ${bad}`, { ...base, maxChars: 200 });
        expect(r.violations.join()).toContain('링크');
      },
    );
  });

  describe('brand 정확히 1회', () => {
    it('0회 거부', () => {
      const r = validateComment(ofLength(60).replace('운명원', '그곳'), base);
      expect(r.violations.join()).toContain('운명원');
    });
    it('2회 거부', () => {
      const r = validateComment(ofLength(60) + ' 운명원', base);
      expect(r.violations.join()).toContain('정확히 1번');
    });
  });

  describe('후기 날조', () => {
    const mk = (s: string) =>
      `남자심리 때문에 힘들다 ㅠㅠ 그냥 인연인가 싶고 그렇네요. ${s}`;
    it.each([
      '운명원 봤는데 맞더라',
      '운명원 받아봤는데 좋음',
      '운명원 다녀왔는데 신기',
      '운명원 상담받고 왔어요',
      '운명원 후기 보니 좋대',
      '운명원 소름 돋았어',
      '운명원 해봤더니 신기함',
      '운명원 봤더니 울었음',
    ])('거부: %s', (s) => {
      const r = validateComment(mk(s), base);
      expect(r.ok).toBe(false);
      expect(r.violations.join()).toContain('경험');
    });
    it.each([
      '운명원 사주 보고 싶다',
      '운명원 사주 잘 본다던데',
      '운명원이 잘 본다던데 나도 보고 싶다',
      '운명원 본다던데 궁금하다',
    ])('통과: %s', (s) => {
      expect(validateComment(mk(s), base).violations).toEqual([]);
    });
    it('브랜드 없는 문장의 경험 표현은 이 규칙 대상이 아니다', () => {
      const r = validateComment(
        '남자심리 보다가 소름 돋았다 진짜 공감됨 ㅠㅠ 그냥 인연이면 만나겠지. 운명원 사주 잘 본다던데 보고 싶다',
        base,
      );
      expect(r.violations).toEqual([]);
    });
  });

  describe('근거 키워드', () => {
    it('통과: 키워드 포함', () =>
      expect(validateComment(ofLength(60), base).ok).toBe(true));
    it('거부: 키워드 없음', () => {
      const r = validateComment(ofLength(60), {
        ...base,
        evidenceKeywords: ['재회'],
      });
      expect(r.violations.join()).toContain('재회');
    });
    it('키워드가 하나라도 있으면 통과', () => {
      expect(
        validateComment(ofLength(60), {
          ...base,
          evidenceKeywords: ['재회', '남자심리'],
        }).ok,
      ).toBe(true);
    });
    it('키워드 목록이 없으면 이 규칙은 건너뜀(서버 재검증용)', () => {
      expect(
        validateComment(ofLength(60), { ...base, evidenceKeywords: [] }).ok,
      ).toBe(true);
    });
  });

  describe('최근 댓글과의 유사도 (bigram Jaccard < 0.35)', () => {
    it('거부: 거의 같은 댓글', () => {
      const t = ofLength(60);
      const r = validateComment(t, {
        ...base,
        recentComments: [t.replace('ㅠㅠ', '')],
      });
      expect(r.violations.join()).toContain('비슷');
    });
    it('통과: 전혀 다른 댓글', () => {
      const r = validateComment(ofLength(60), {
        ...base,
        recentComments: [
          '오늘 점심은 김치찌개 먹었는데 맛있었어요 다들 맛점하세요 감사합니다',
        ],
      });
      expect(r.ok).toBe(true);
    });
    it('공백 차이는 무시하고 계산', () => {
      const t = ofLength(60);
      const r = validateComment(t, {
        ...base,
        recentComments: [t.replace(/ /g, '')],
      });
      expect(r.violations.join()).toContain('비슷');
    });
  });

  describe('PDF 예시 댓글', () => {
    it('139자라 길이 규칙만 위반, 나머지는 통과', () => {
      expect([...PDF_EXAMPLE].length).toBe(139);
      const r = validateComment(PDF_EXAMPLE, base);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0]).toContain('글자');
    });
    it('길이 상한을 늘리면 전부 통과', () => {
      expect(validateComment(PDF_EXAMPLE, { ...base, maxChars: 150 })).toEqual({
        ok: true,
        violations: [],
      });
    });
  });

  it('여러 위반을 한꺼번에 반환', () => {
    const r = validateComment('짧음 www.a.com', base);
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });
});
