/** 기록 탭: 모든 게시 시도를 시간순 표로(성공 링크, 실패 사유·스크린샷, 미확인 경고). */
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import {
  COMMENT_STATUS,
  errorMessage,
  getComments,
  isTerminal,
  screenshotUrl,
  type CommentLog,
} from "./api";
import { Panel } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  opening: "프로필 여는 중",
  typing: "입력 중",
  posting: "게시 중",
  verifying: "확인 중",
};

const kst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "short",
  timeStyle: "medium",
});

function Result({ c }: { c: CommentLog }) {
  const shot = c.screenshotPath && (
    <a href={screenshotUrl(c.screenshotPath)} target="_blank" rel="noreferrer">
      <img
        src={screenshotUrl(c.screenshotPath)}
        alt="실패 화면 캡처"
        className="mt-1 h-12 rounded border border-line"
      />
    </a>
  );
  if (c.status === COMMENT_STATUS.POSTED)
    return c.commentUrl ? (
      <a
        href={c.commentUrl}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-acc underline"
      >
        게시 완료 · 댓글 보기
      </a>
    ) : (
      <span className="font-semibold text-acc">게시 완료</span>
    );
  if (c.status === COMMENT_STATUS.FAILED)
    return (
      <div className="text-bad">
        <span className="font-semibold">실패</span>
        <p className="m-0 text-xs">{c.error}</p>
        {shot}
      </div>
    );
  if (c.status === COMMENT_STATUS.UNVERIFIED)
    return (
      <div className="text-warn">
        <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-semibold">
          <TriangleAlert size={12} aria-hidden />
          미확인
        </span>
        <p className="m-0 mt-1 text-xs">{c.error}</p>
        {shot}
      </div>
    );
  return (
    <span className="text-sub">
      {isTerminal(c.status) ? c.status : (STATUS_LABEL[c.status] ?? c.status)}
    </span>
  );
}

export function History() {
  const q = useQuery({ queryKey: ["comments"], queryFn: getComments });
  return (
    <main className="mx-auto max-w-[1600px] px-6 py-4">
      <Panel
        title="게시 기록"
        right={q.data ? `${q.data.length}건` : undefined}
      >
        {q.isError && (
          <p
            role="alert"
            className="m-0 rounded-[10px] bg-bad-soft p-3 text-[13px] text-bad"
          >
            {errorMessage(q.error)}
          </p>
        )}
        {q.data?.length === 0 && (
          <p className="m-0 rounded-[10px] bg-bg p-3.5 text-[13px] text-sub">
            아직 게시한 댓글이 없습니다. 대시보드에서 영상을 고르고 댓글을 달아
            보세요.
          </p>
        )}
        {q.data && q.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="p-2 font-semibold">시각</th>
                  <th className="p-2 font-semibold">영상</th>
                  <th className="p-2 font-semibold">프로필</th>
                  <th className="p-2 font-semibold">댓글</th>
                  <th className="p-2 font-semibold">결과</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((c) => (
                  <tr key={c.id} className="border-b border-line align-top">
                    <td className="p-2 whitespace-nowrap tabular-nums text-sub">
                      {kst.format(new Date(c.createdAt))}
                    </td>
                    <td className="max-w-64 p-2">{c.videoTitle}</td>
                    <td className="p-2 whitespace-nowrap">{c.profileName}</td>
                    <td className="max-w-96 p-2">
                      <span className="line-clamp-2" title={c.text}>
                        {c.text}
                      </span>
                    </td>
                    <td className="p-2">
                      <Result c={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
