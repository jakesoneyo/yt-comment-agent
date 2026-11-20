/**
 * 댓글 생성 프롬프트와 구조화 출력 스키마. 규칙 강제는 검증기(comment-validator)가 하고,
 * 여기서는 "좋은 댓글을 처음부터 쓰게" 방향만 준다. 스키마 필드 순서 = 분석 → 작성 순서.
 */
import { z } from 'zod';

export const DraftOutputSchema = z.object({
  concern: z.string().describe('영상이 다루는 연애 고민 한 줄 (30자 내외)'),
  evidence: z
    .array(
      z.object({
        ts: z
          .string()
          .describe('자막 타임스탬프 mm:ss. 자막이 없으면 "제목" 또는 "설명"'),
        quote: z
          .string()
          .describe('자막/제목/설명에서 그대로 옮긴 구체 발언·장면'),
        keyword: z
          .string()
          .describe(
            'quote 안에 있는 2~8글자 핵심어. 댓글에 글자 그대로 들어가야 함. 자동 자막이 잘린·틀린 말("땡땡이"→"땡땡")은 고르지 말 것',
          ),
      }),
    )
    .describe('근거 2~3개'),
  viewer_tone: z.string().describe('인기 댓글 말투 요약 한 줄'),
  comment: z.string().describe('최종 댓글'),
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export interface PromptInput {
  brand: string;
  minChars: number;
  maxChars: number;
  persona: string;
  title: string;
  channelTitle: string;
  description: string;
  /** "[mm:ss] 문장" 줄 목록. 없으면 빈 배열 */
  transcript: string[];
  /** 인기 댓글(relevance 순) 본문 */
  topComments: string[];
  /** 반복 금지용 최근 게시 댓글 */
  recentComments: string[];
}

export function buildSystemPrompt(
  i: Pick<PromptInput, 'brand' | 'minChars' | 'maxChars' | 'persona'>,
): string {
  return `너는 유튜브 연애 영상을 방금 끝까지 본 실제 시청자다. 아래 페르소나 그대로 댓글 하나를 쓴다.

페르소나: ${i.persona}

목표: 영상 내용에 딱 맞는 공감 댓글을 쓰되, 읽는 사람이 자연스럽게 "${i.brand}" 연애사주가 궁금해지게 만든다. 광고처럼 보이는 순간 실패다.

댓글 흐름 (4단, 문장 수는 자유):
1. 영상 속 구체 장면·발언에 대한 공감 — evidence의 keyword를 글자 그대로 넣는다.
   자막은 자동 생성이라 글자가 빠지거나 틀린 곳이 있다. 그런 표현은 keyword로 고르지 말고, 사람이 읽어도 뜻이 온전한 말을 고른다
2. 페르소나 본인의 연애 고민 한 조각
3. "결국 인연/타이밍/운명인가" 쪽으로 생각이 넘어감
4. **남에게 들은 말 + 앞으로의 바람**으로 ${i.brand}을(를) 꺼낸다. 표현은 매번 새로 만든다. 방향 예시(그대로 베끼지 말 것):
   - 친구가 ${i.brand} 얘기를 자꾸 하던데 이번엔 진짜 가볼까 싶다
   - ${i.brand}에서 연애운 본 사람들 얘기가 많던데 나도 궁금해짐
   - 이럴 때 ${i.brand} 같은 데서 언제 인연 오는지 한번 물어보고 싶다
   위치도 꼭 마지막 문장일 필요는 없고, 흐름상 자연스러운 곳이면 된다

반드시 지킬 것:
- ${i.minChars}~${i.maxChars}글자. "${i.brand}"는 정확히 1번
- ${i.brand}을(를) 직접 이용해 본 것처럼 쓰지 않는다 (봤는데·받아봤다·다녀왔다·맞더라·후기 등 금지). 가격·위치·적중률 같은 사실도 지어내지 않는다
- 남에게 권하지 않는다 ("추천", "꼭 가보세요", "강추" 금지). 본인 바람만 말한다
- 링크·URL·해시태그·이모지 남발·다른 업체 이름 금지
- 인기 댓글의 말투(반말/존댓말, ㅋㅋ·ㅠㅠ 빈도, 문장 길이)에 섞여 보이게 쓰되 페르소나 말버릇을 유지한다
- 최근 댓글 목록과 표현·문장 구조를 겹치지 않는다

분석 먼저: concern → evidence(2~3개, quote는 원문 그대로 복사) → viewer_tone을 채운 뒤 그 분석에 근거해 comment를 쓴다.`;
}

function list(items: string[], empty: string): string {
  return items.length ? items.map((s) => `- ${s}`).join('\n') : empty;
}

export function buildUserPrompt(i: PromptInput): string {
  // ponytail: 길이 상한은 글자 수로 단순 절단. 긴 영상에서 품질 문제면 앞/중간/뒤 샘플링으로
  const transcript = i.transcript.join('\n').slice(0, 8000);
  return `[영상]
제목: ${i.title}
채널: ${i.channelTitle}
설명: ${i.description.slice(0, 600) || '(없음)'}

[자막]
${transcript || '(자막 없음 — 제목과 설명을 근거로 쓰고 evidence.ts는 "제목"/"설명")'}

[인기 댓글]
${list(
  i.topComments.map((c) => c.slice(0, 200)),
  '(댓글 없음 — 20~30대 연애 영상 시청자의 평범한 말투로)',
)}

[최근에 쓴 댓글 — 이것과 겹치지 말 것]
${list(i.recentComments, '(없음)')}`;
}

/** 검증 실패 시 다음 시도에 덧붙이는 피드백. violations는 검증기가 만든 한국어 지시문 */
export function buildRetryPrompt(
  previousComment: string,
  violations: string[],
): string {
  return `방금 쓴 댓글이 규칙을 어겼다. 분석은 유지해도 되지만 comment는 아래를 모두 고쳐서 새로 써라.

이전 댓글: ${previousComment}

고칠 점:
${violations.map((v) => `- ${v}`).join('\n')}`;
}
