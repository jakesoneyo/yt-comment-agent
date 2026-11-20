/** ② 맥락 분석과 초안: 초안 생성 버튼, 고민·근거·말투, 수정 가능한 초안, 검증 체크리스트, 게시 계정 선택. 초안은 버튼을 눌렀을 때만 만든다(Claude 과금). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import {
  createDraft,
  errorMessage,
  getStats,
  MAX_CHARS,
  type Draft,
  type Video,
} from "./api";
import { btnGhost, btnPri, Panel } from "./ui";

/** 화면 체크리스트 6항목. id는 backend comment-validator.ts의 RuleId와 같아야 함 */
const RULES: { id: string; label: string }[] = [
  { id: "length", label: "40~120자" },
  { id: "link", label: "링크·해시태그 없음" },
  { id: "brand", label: "운명원 1회" },
  { id: "fabricated", label: "후기 날조 없음" },
  { id: "evidence", label: "근거 키워드 포함" },
  { id: "similar", label: "최근 댓글과 다름" },
];

/** 근거 인용 안의 keyword를 mark로 강조. */
function Quote({ quote, keyword }: { quote: string; keyword: string }) {
  const i = keyword ? quote.indexOf(keyword) : -1;
  if (i < 0) return <>{quote}</>;
  return (
    <>
      {quote.slice(0, i)}
      <mark className="rounded-[3px] bg-acc-soft px-0.5 font-bold text-acc">
        {keyword}
      </mark>
      {quote.slice(i + keyword.length)}
    </>
  );
}

interface Props {
  video: Video | null;
  /** 영상 미선택 안내 문구(탭마다 단계 이름이 다르다) */
  emptyNote?: string;
  /** null이면 아직 초안 없음 */
  text: string | null;
  profile: string;
  onText: (t: string) => void;
  onProfile: (p: string) => void;
  /** 새 초안이 도착하면 부모가 text·profile을 초기화하도록 알린다 */
  onDraft: (d: Draft) => void;
}

export function DraftPanel({
  video,
  emptyNote = "먼저 ①에서 영상을 선택하세요.",
  text,
  profile,
  onText,
  onProfile,
  onDraft,
}: Props) {
  const stats = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const gen = useMutation({
    mutationFn: (v: { id: string; profile?: string }) =>
      createDraft(v.id, v.profile),
    onSuccess: onDraft,
  });
  const draft = gen.data;

  if (!video) {
    return <Panel n={2} title="맥락 분석과 초안" disabledNote={emptyNote} />;
  }
  // 영상당 댓글 1개 규칙: 이미 단 영상은 초안을 만들어도 게시할 수 없으니 Claude 호출 전에 막는다
  if (video.done && !draft) {
    return (
      <Panel
        n={2}
        title="맥락 분석과 초안"
        disabledNote="이미 댓글을 단 영상입니다. 영상당 댓글은 1개라 초안을 만들지 않습니다."
      />
    );
  }

  const len = text === null ? 0 : [...text].length;
  const edited = draft !== undefined && text !== draft.comment;
  const violations = draft?.validation.violations ?? [];
  const failed = draft?.validation.failed ?? [];

  return (
    <Panel n={2} title="맥락 분석과 초안" right={video.title.slice(0, 20)}>
      {!draft && !gen.isPending && (
        <div className="flex flex-col gap-3">
          <p className="m-0 line-clamp-2 text-[13px] font-semibold">
            {video.title}
          </p>
          <button
            type="button"
            className={btnPri}
            onClick={() =>
              gen.mutate({ id: video.videoId, profile: profile || undefined })
            }
          >
            <Sparkles size={16} aria-hidden />
            초안 만들기
          </button>
          <p className="m-0 text-xs text-muted">
            버튼을 눌렀을 때만 Claude를 호출합니다.
          </p>
        </div>
      )}

      {gen.isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex animate-pulse flex-col gap-3"
        >
          <p className="m-0 font-semibold text-acc">
            자막·인기 댓글 분석 중 (10~30초)
          </p>
          <div className="h-6 w-4/5 rounded bg-line" />
          <div className="h-12 rounded bg-line" />
          <div className="h-28 rounded-[10px] bg-line" />
        </div>
      )}

      {gen.isError && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-bad-soft p-3 text-[13px] text-bad"
        >
          {errorMessage(gen.error)}
        </p>
      )}

      {draft && !gen.isPending && text !== null && (
        <>
          <div>
            <span className="text-xs font-semibold text-sub">
              영상이 다루는 고민
            </span>
            <div className="mt-1.5 text-[17px] leading-snug font-bold">
              {draft.concern}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold text-sub">근거 장면</span>
            {[...draft.evidence]
              .sort((a, b) => a.ts.localeCompare(b.ts))
              .map((e) => (
                <div
                  key={e.ts + e.quote}
                  className="grid grid-cols-[52px_1fr] gap-2.5 border-t border-line py-2.5 first:mt-1.5"
                >
                  <span className="font-semibold tabular-nums text-acc">
                    {e.ts}
                  </span>
                  <q className="leading-normal text-sub [quotes:none]">
                    <Quote quote={e.quote} keyword={e.keyword} />
                  </q>
                </div>
              ))}
          </div>
          <div>
            <span className="text-xs font-semibold text-sub">
              인기 댓글 말투
            </span>
            <p className="m-0 mt-1.5 text-[13px] leading-normal text-sub">
              {draft.viewer_tone}
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center">
              <label
                htmlFor="draft-text"
                className="text-xs font-semibold text-sub"
              >
                댓글 초안 (수정 가능)
              </label>
              <span
                className={`ml-auto text-xs tabular-nums ${len > MAX_CHARS ? "text-bad" : "text-muted"}`}
              >
                {len} / {MAX_CHARS}자
              </span>
            </div>
            <textarea
              id="draft-text"
              value={text}
              onChange={(e) => onText(e.target.value)}
              className="min-h-30 w-full resize-y rounded-[10px] border border-line bg-panel p-3 text-[15px] leading-relaxed"
            />
          </div>
          <div>
            {edited && (
              <p className="m-0 mb-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
                수정됨: 게시할 때 서버가 다시 검사합니다
              </p>
            )}
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3.5 gap-y-1.5 p-0">
              {RULES.map((r) => {
                const i = failed.indexOf(r.id);
                const bad = i >= 0 ? violations[i] : undefined;
                return (
                  <li
                    key={r.label}
                    className={`flex items-start gap-1.5 text-[13px] ${bad ? "col-span-2 text-bad" : "text-sub"}`}
                  >
                    {bad ? (
                      <XCircle
                        size={16}
                        className="mt-px shrink-0"
                        aria-label="위반"
                      />
                    ) : (
                      <CheckCircle2
                        size={16}
                        className="mt-px shrink-0 text-acc"
                        aria-label="통과"
                      />
                    )}
                    <span>{bad ?? r.label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 mt-2 text-xs text-muted">
              {draft.validation.attempts}회 시도
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="profile" className="text-xs font-semibold text-sub">
              게시 계정
            </label>
            <select
              id="profile"
              value={profile}
              onChange={(e) => onProfile(e.target.value)}
              className="rounded-lg border border-line bg-panel p-2"
            >
              {Object.entries(stats.data?.perProfile ?? { [profile]: 0 }).map(
                ([name, n]) => (
                  <option key={name} value={name}>
                    {name} (오늘 {n}회)
                  </option>
                ),
              )}
            </select>
            <button
              type="button"
              className={`${btnGhost} ml-auto`}
              onClick={() => gen.mutate({ id: video.videoId, profile })}
            >
              <Sparkles size={16} aria-hidden />
              다시 생성
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
