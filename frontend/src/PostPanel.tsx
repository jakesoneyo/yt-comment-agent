/** ③ 댓글 달기: 게시 요청 → logId 1초 폴링 → 5단계 스텝, 종료 시 성공 링크/실패·미확인 안내와 스크린샷. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleDashed,
  Loader2,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  API,
  COMMENT_STATUS,
  errorMessage,
  getComment,
  getStats,
  isTerminal,
  postComment,
  screenshotUrl,
  type Video,
} from "./api";
import { btnPri, Panel } from "./ui";

const STEPS = [
  [COMMENT_STATUS.OPENING, "크롬 프로필 여는 중"],
  [COMMENT_STATUS.TYPING, "한 글자씩 입력 중"],
  [COMMENT_STATUS.POSTING, "게시 중"],
  [COMMENT_STATUS.VERIFYING, "내 댓글 확인 중"],
  [COMMENT_STATUS.POSTED, "게시 완료"],
] as const;

interface Props {
  video: Video | null;
  text: string | null;
  profile: string;
}

export function PostPanel({ video, text, profile }: Props) {
  const qc = useQueryClient();
  const [logId, setLogId] = useState<number | null>(null);
  const stats = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const start = useMutation({
    mutationFn: postComment,
    onSuccess: (r) => setLogId(r.logId),
  });
  const log = useQuery({
    queryKey: ["comment", logId],
    queryFn: () => getComment(logId!),
    enabled: logId !== null,
    refetchInterval: (q) =>
      q.state.data && isTerminal(q.state.data.status) ? false : 1000,
  });
  const status = log.data?.status;

  // 종료되면 카운터·기록·완료 배지를 갱신. 게시/미확인은 락이 남으므로 목록을 다시 받지 않고(검색 쿼터 절약) 캐시의 done만 올린다
  useEffect(() => {
    if (!status || !isTerminal(status)) return;
    void qc.invalidateQueries({ queryKey: ["stats"] });
    void qc.invalidateQueries({ queryKey: ["comments"] });
    if (status !== COMMENT_STATUS.FAILED) {
      qc.setQueriesData<{ videoId: string; done: boolean }[]>(
        { queryKey: ["videos"] },
        (old) =>
          old?.map((v) =>
            v.videoId === log.data?.videoId ? { ...v, done: true } : v,
          ),
      );
    }
  }, [status, qc, log.data?.videoId]);

  const atLimit =
    stats.data !== undefined && stats.data.used >= stats.data.limit;
  const reason = !video
    ? "먼저 ①에서 영상을 선택하세요."
    : text === null
      ? "먼저 ②에서 초안을 만드세요."
      : video.done && logId === null
        ? "이미 댓글을 단 영상은 게시할 수 없습니다."
        : atLimit
          ? `오늘 게시 상한에 도달했습니다 (${stats.data!.used}/${stats.data!.limit}).`
          : null;

  if (!video || text === null)
    return <Panel n={3} title="댓글 달기" disabledNote={reason!} />;

  return (
    <Panel n={3} title="댓글 달기">
      {logId === null && (
        <>
          <button
            type="button"
            className={`${btnPri} py-3.5`}
            disabled={reason !== null || start.isPending}
            onClick={() =>
              start.mutate({
                videoId: video.videoId,
                profileName: profile,
                text,
              })
            }
          >
            <Send size={16} aria-hidden />
            {profile}로 댓글 달기
          </button>
          {reason && <p className="m-0 text-xs text-warn">{reason}</p>}
        </>
      )}
      {start.isError && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-bad-soft p-3 text-[13px] text-bad"
        >
          {errorMessage(start.error)}
        </p>
      )}

      {logId !== null &&
        status !== COMMENT_STATUS.FAILED &&
        status !== COMMENT_STATUS.UNVERIFIED && (
          <ol className="m-0 flex list-none flex-col p-0" aria-live="polite">
            {STEPS.map(([key, label], i) => {
              const cur = STEPS.findIndex(([k]) => k === status);
              const done = i < cur || status === COMMENT_STATUS.POSTED;
              const now = i === cur && !done;
              return (
                <li
                  key={key}
                  className={`grid grid-cols-[28px_1fr] gap-2.5 py-2.5 ${done || now ? "text-ink" : "text-muted"} ${now ? "font-semibold" : ""}`}
                >
                  {done ? (
                    <Check size={20} className="text-acc" aria-label="완료" />
                  ) : now ? (
                    <Loader2
                      size={20}
                      className="animate-spin text-warn"
                      aria-label="진행 중"
                    />
                  ) : (
                    <CircleDashed size={20} aria-label="대기" />
                  )}
                  {label}
                </li>
              );
            })}
          </ol>
        )}

      {/* 라이브 미리보기: 백엔드가 크롬 화면을 MJPEG로 흘려서 img만으로 실시간 재생. logId로 게시마다 새 연결 */}
      {logId !== null &&
        status !== COMMENT_STATUS.FAILED &&
        status !== COMMENT_STATUS.UNVERIFIED && (
          <figure className="m-0 flex flex-col gap-1.5">
            <figcaption className="flex items-center gap-1.5 text-xs font-semibold text-sub">
              {!status || !isTerminal(status) ? (
                <span
                  className="size-2 animate-pulse rounded-full bg-bad"
                  aria-hidden
                />
              ) : null}
              {profile} 크롬 화면
            </figcaption>
            <img
              src={`${API}/posting/live?log=${logId}`}
              alt={`${profile} 크롬 창 실시간 화면`}
              className="aspect-video w-full rounded-md border border-line bg-bg object-contain object-top"
            />
          </figure>
        )}

      {status === COMMENT_STATUS.POSTED && log.data?.commentUrl && (
        <a
          href={log.data.commentUrl}
          target="_blank"
          rel="noreferrer"
          className={`${btnPri} no-underline`}
        >
          댓글 보기
        </a>
      )}

      {(status === COMMENT_STATUS.FAILED ||
        status === COMMENT_STATUS.UNVERIFIED) &&
        log.data && (
          <div
            role="alert"
            className={`flex flex-col gap-2.5 rounded-[10px] p-3.5 text-[13px] ${status === COMMENT_STATUS.FAILED ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
          >
            <p className="m-0 flex items-start gap-1.5 font-semibold">
              <TriangleAlert size={16} className="mt-px shrink-0" aria-hidden />
              {status === COMMENT_STATUS.FAILED
                ? "게시에 실패했습니다"
                : "게시됐을 수 있습니다. 영상에서 직접 확인하세요"}
            </p>
            {log.data.error && <p className="m-0">{log.data.error}</p>}
            {log.data.screenshotPath && (
              <a
                href={screenshotUrl(log.data.screenshotPath)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={screenshotUrl(log.data.screenshotPath)}
                  alt="실패 시점 화면 캡처"
                  className="w-full rounded-md border border-line"
                />
              </a>
            )}
            {status === COMMENT_STATUS.UNVERIFIED && (
              <a
                className="font-semibold underline"
                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                영상 열기
              </a>
            )}
            {status === COMMENT_STATUS.FAILED && (
              <button
                type="button"
                className={btnPri}
                onClick={() => setLogId(null)}
              >
                다시 시도
              </button>
            )}
          </div>
        )}

      {logId === null && (
        <p className="m-0 rounded-[10px] bg-bg p-3.5 text-[13px] leading-normal text-sub">
          게시가 끝나면 댓글로 바로 이동하는 링크가 여기에 나타납니다. 실패하면
          사유와 화면 캡처를 보여줍니다.
        </p>
      )}
    </Panel>
  );
}
