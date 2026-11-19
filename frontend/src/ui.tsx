/** 공용 UI: 패널 틀, 버튼 클래스, 영상 카드, 숫자·시간 포맷. */
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Video } from "./api";

export const btnPri =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-acc px-3.5 py-2.5 font-semibold text-on-acc cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-px";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-bg px-3.5 py-2.5 font-semibold text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 border border-line";

const rtf = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

/** 게시일을 "2시간 전" 같은 상대 시간으로. */
export function relTime(iso: string, now = Date.now()): string {
  const min = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  if (Math.abs(min) < 60 * 24) return rtf.format(Math.round(min / 60), "hour");
  return rtf.format(Math.round(min / 60 / 24), "day");
}

export const fmtNum = (n: number) => n.toLocaleString("ko-KR");

/** 번호 달린 패널 틀. disabledNote가 있으면 본문 대신 안내 문구만 보여 준다(앞 단계 미완료). */
export function Panel(p: {
  n?: number;
  title: string;
  right?: ReactNode;
  disabledNote?: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2.5 border-b border-line px-4.5 py-4">
        {p.n && (
          <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-panel">
            {p.n}
          </span>
        )}
        <h2 className="m-0 text-[15px] font-semibold">{p.title}</h2>
        <span className="ml-auto text-xs text-muted">{p.right}</span>
      </div>
      <div className="flex flex-col gap-3.5 overflow-auto p-4.5">
        {p.disabledNote ? (
          <p className="m-0 rounded-[10px] bg-bg p-3.5 text-[13px] leading-normal text-sub">
            {p.disabledNote}
          </p>
        ) : (
          p.children
        )}
      </div>
    </section>
  );
}

export function CardSkeleton() {
  return (
    <div
      className="grid animate-pulse grid-cols-[112px_1fr] gap-2.5 p-2"
      aria-hidden
    >
      <div className="aspect-video rounded-md bg-line" />
      <div className="space-y-2 pt-1">
        <div className="h-3 rounded bg-line" />
        <div className="h-3 w-2/3 rounded bg-line" />
      </div>
    </div>
  );
}

/** 영상 카드(선택 가능). extra는 떡상 탭의 시간당 조회수 같은 추가 줄. */
export function VideoCard(p: {
  v: Video;
  selected: boolean;
  onSelect: () => void;
  extra?: ReactNode;
}) {
  const { v } = p;
  return (
    <button
      type="button"
      onClick={p.onSelect}
      aria-pressed={p.selected}
      className={`grid w-full cursor-pointer grid-cols-[112px_1fr] gap-2.5 rounded-[10px] border p-2 text-left hover:bg-bg ${
        p.selected ? "border-acc bg-acc-soft" : "border-transparent"
      }`}
    >
      <img
        src={v.thumbnailUrl}
        alt={`${v.title} 썸네일`}
        className="aspect-video w-28 rounded-md bg-line object-cover"
      />
      <div className="min-w-0">
        <h3 className="mb-1 line-clamp-2 text-[13px] leading-snug font-semibold">
          {v.title}
        </h3>
        <p className="m-0 text-xs text-muted">
          {v.channelTitle} · {relTime(v.publishedAt)} · 조회{" "}
          {fmtNum(v.viewCount)}
        </p>
        {p.extra}
        {v.done && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-[5px] bg-bg px-1.5 py-0.5 text-[11px] font-semibold text-sub">
            <CheckCircle2 size={12} aria-hidden />
            완료
          </span>
        )}
      </div>
    </button>
  );
}
