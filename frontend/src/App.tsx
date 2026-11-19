/** 앱 셸: 상단 헤더(로고·탭·오늘 게시 카운터)와 탭 전환. */
import { useQuery } from "@tanstack/react-query";
import { MessageCircleMore } from "lucide-react";
import { useState } from "react";
import { getStats } from "./api";
import { Dashboard } from "./Dashboard";
import { History } from "./History";
import { Rising } from "./Rising";

const TABS = ["대시보드", "떡상 후보", "기록"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("대시보드");
  const stats = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const pct = stats.data
    ? Math.min(100, (stats.data.used / stats.data.limit) * 100)
    : 0;

  return (
    <>
      <header className="flex h-15 items-center gap-7 border-b border-line bg-panel px-6">
        <div className="flex items-center gap-2 text-base font-bold">
          <MessageCircleMore size={20} className="text-acc" aria-hidden />
          댓글 에이전트
        </div>
        <nav className="flex gap-1" aria-label="주요 메뉴">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-lg px-3 py-2 ${tab === t ? "bg-bg font-semibold text-ink" : "text-sub"}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5 text-sub">
          오늘 게시
          <b className="text-lg tabular-nums text-ink">
            {stats.data ? `${stats.data.used} / ${stats.data.limit}` : "- / -"}
          </b>
          <div
            className="h-1.5 w-30 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="오늘 게시 사용량"
            aria-valuemin={0}
            aria-valuemax={stats.data?.limit ?? 0}
            aria-valuenow={stats.data?.used ?? 0}
          >
            <span
              className="block h-full bg-acc"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>
      {tab === "대시보드" && <Dashboard />}
      {tab === "떡상 후보" && <Rising />}
      {tab === "기록" && <History />}
    </>
  );
}
