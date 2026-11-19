import { extractLc, findPostedComment, normalizeText } from './comment-match';

describe('normalizeText', () => {
  it('개행·연속 공백을 한 칸으로', () => {
    expect(normalizeText('  안녕 \n\n  하세요\t반가워 ')).toBe(
      '안녕 하세요 반가워',
    );
  });
});

describe('extractLc', () => {
  it('상대 href에서 lc 추출', () => {
    expect(extractLc('/watch?v=abc&lc=Ugx123.AaB&pp=x')).toBe('Ugx123.AaB');
  });
  it('lc 없거나 href 없으면 null', () => {
    expect(extractLc('/watch?v=abc')).toBeNull();
    expect(extractLc(null)).toBeNull();
  });
});

describe('findPostedComment', () => {
  const threads = [
    { text: '남의 댓글', href: '/watch?v=a&lc=L0' },
    { text: ' 내   댓글\n입니다 ', href: '/watch?v=a&lc=L1' },
  ];
  it('공백이 달라도 본문이 같으면 위치와 lc 반환', () => {
    expect(findPostedComment(threads, '내 댓글 입니다')).toEqual({
      index: 1,
      lc: 'L1',
    });
  });
  it('없으면 null', () => {
    expect(findPostedComment(threads, '없는 댓글')).toBeNull();
  });
});
