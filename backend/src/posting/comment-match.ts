/** 게시 확인용 순수 함수: 본문 공백 정규화, 내 댓글 탐색, 시간 링크에서 lc(댓글 ID) 추출. */

export interface ThreadSnapshot {
  text: string;
  href: string | null;
}

/** 공백(개행 포함) 연속을 한 칸으로 줄여 YouTube 렌더링 차이를 흡수한다. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** `/watch?v=ID&lc=XXXX` 형태 href에서 lc 값을 뽑는다. 없으면 null. */
export function extractLc(href: string | null): string | null {
  if (!href) return null;
  return new URL(href, 'https://www.youtube.com').searchParams.get('lc');
}

/**
 * 상위 스레드 중 본문이 내가 쓴 text와 같은 것의 위치와 lc.
 * ponytail: 본문 일치로만 본인 댓글 판별 — 유사도 규칙상 본문이 사실상 고유. 필요 시 작성자 핸들 비교 추가
 */
export function findPostedComment(
  threads: ThreadSnapshot[],
  text: string,
): { index: number; lc: string } | null {
  const target = normalizeText(text);
  for (const [index, t] of threads.entries()) {
    if (normalizeText(t.text) !== target) continue;
    const lc = extractLc(t.href);
    if (lc) return { index, lc };
  }
  return null;
}
