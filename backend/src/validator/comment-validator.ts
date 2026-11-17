/**
 * 댓글 검증기(순수 함수). 규칙은 프롬프트가 아니라 코드로 강제한다.
 * violations 문장은 재생성 프롬프트에 그대로 붙이므로 "무엇을 어떻게 고쳐라" 형태의 한국어로 쓴다.
 */

export interface ValidateOptions {
  minChars: number;
  maxChars: number;
  brand: string;
  /** 비어 있으면 근거 반영 규칙은 건너뜀(수정본을 서버에서 재검증할 때 evidence가 없을 수 있음) */
  evidenceKeywords: string[];
  recentComments: string[];
}

export interface ValidationResult {
  ok: boolean;
  violations: string[];
}

const LINK_PATTERN = /https?|www\.|\.com|\.kr|youtu\.be|#/i;
// 브랜드를 "이미 써봤다"고 말하는 완료형 경험 표현. "본다던데/보고 싶다/봤으면"은 전언·의향이라 걸리지 않아야 함
// "봤"은 과거형 전부(봤어요·봤는데·봤더니)를 잡되, 바람을 뜻하는 "봤으면"만 예외
const REVIEW_PATTERN =
  /봤(?!으면)|받았|받아봤|다녀왔|다녀옴|갔다\s?왔|상담받|후기|맞더라|맞았|소름|해봤/;
const SIMILARITY_LIMIT = 0.35;

function bigrams(text: string): Set<string> {
  const chars = [...text.replace(/\s+/g, '')];
  const set = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1]);
  return set;
}

/** 문자 bigram 집합의 Jaccard 유사도(공백 제거 후). 한국어는 띄어쓰기가 불안정해 어절 대신 문자 단위로 비교. */
export function bigramJaccard(a: string, b: string): number {
  const sa = bigrams(a);
  const sb = bigrams(b);
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 댓글이 SPEC §5 검증기 6개 규칙을 통과하는지 판정한다. 위반은 중단 없이 전부 모아 한 번에 돌려준다
 * (재생성 1회에 모두 고치게 하려는 것).
 */
export function validateComment(
  text: string,
  opts: ValidateOptions,
): ValidationResult {
  const violations: string[] = [];
  const len = [...text].length;

  if (len < opts.minChars || len > opts.maxChars) {
    violations.push(
      `댓글은 ${opts.minChars}~${opts.maxChars}글자여야 합니다 (현재 ${len}글자). 길이를 맞춰 다시 쓰세요.`,
    );
  }

  if (LINK_PATTERN.test(text)) {
    violations.push(
      '링크·URL(http, www, .com, .kr, youtu.be)과 해시태그(#)는 넣지 마세요.',
    );
  }

  const brandCount = text.split(opts.brand).length - 1;
  if (brandCount !== 1) {
    violations.push(
      `'${opts.brand}'은(는) 댓글에 정확히 1번만 언급해야 합니다 (현재 ${brandCount}번).`,
    );
  }

  // 문장 단위로 보는 이유: 브랜드와 무관한 문장의 "소름" 등은 정상 감상이라 막지 않기 위함
  const fabricated = text
    .split(/[.!?…\n]+/)
    .some((s) => s.includes(opts.brand) && REVIEW_PATTERN.test(s));
  if (fabricated) {
    violations.push(
      `'${opts.brand}'을(를) 직접 이용한 경험(봤는데, 받아봤, 후기, 맞더라 등)처럼 쓰지 말고, "잘 본다던데 나도 보고 싶다"처럼 전해 들은 말과 앞으로의 의향으로만 쓰세요.`,
    );
  }

  if (
    opts.evidenceKeywords.length > 0 &&
    !opts.evidenceKeywords.some((k) => text.includes(k))
  ) {
    violations.push(
      `영상 근거 키워드(${opts.evidenceKeywords.join(', ')}) 중 하나를 댓글에 그대로 포함하세요.`,
    );
  }

  const similar = opts.recentComments.find(
    (r) => bigramJaccard(text, r) >= SIMILARITY_LIMIT,
  );
  if (similar) {
    violations.push(
      '최근에 쓴 댓글과 너무 비슷합니다. 표현과 문장 구조를 완전히 다르게 쓰세요.',
    );
  }

  return { ok: violations.length === 0, violations };
}
