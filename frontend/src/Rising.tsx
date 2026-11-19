/** 떡상 후보 탭: 조건에 맞는 영상 목록과 초안 만들기까지만(게시 버튼 없음). */
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { errorMessage, getVideos, type Draft } from "./api";
import { DraftPanel } from "./DraftPanel";
import { btnGhost, CardSkeleton, fmtNum, Panel, VideoCard } from "./ui";

export function Rising() {
  // 검색 API 쿼터가 커서 5분간은 재조회하지 않는다
  const list = useQuery({
    queryKey: ["videos", "rising"],
    queryFn: () => getVideos("rising"),
    staleTime: 5 * 60_000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [profile, setProfile] = useState("");
  const selected = list.data?.find((v) => v.videoId === selectedId) ?? null;

  return (
    <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 px-6 py-4 min-[1100px]:grid-cols-[420px_1fr]">
      <Panel
        title="떡상 후보"
        right={
          <button
            type="button"
            className={`${btnGhost} px-2 py-1 text-xs`}
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw
              size={12}
              className={list.isFetching ? "animate-spin" : ""}
              aria-hidden
            />
            새로고침
          </button>
        }
      >
        <p className="m-0 rounded-[10px] bg-bg p-3.5 text-[13px] leading-normal text-sub">
          최근 48시간 '연애' 영상 중 조회수 1,000~5,000 · 시간당 150회 이상.
          실제 게시는 하지 않고 초안까지만 만듭니다
        </p>
        {list.isError && (
          <p
            role="alert"
            className="m-0 rounded-[10px] bg-bad-soft p-3 text-[13px] text-bad"
          >
            {errorMessage(list.error)}
          </p>
        )}
        {list.isFetching &&
          !list.data &&
          [0, 1, 2].map((i) => <CardSkeleton key={i} />)}
        {list.data?.map((v) => {
          const hours = Math.max(
            (list.dataUpdatedAt - new Date(v.publishedAt).getTime()) /
              3_600_000,
            1 / 60,
          );
          return (
            <VideoCard
              key={v.videoId}
              v={v}
              selected={v.videoId === selectedId}
              onSelect={() => {
                setSelectedId(v.videoId);
                setText(null);
                setProfile("");
              }}
              extra={
                <p className="m-0 mt-0.5 text-xs font-semibold text-acc">
                  시간당 {fmtNum(Math.round(v.viewCount / hours))}회 · 게시 후{" "}
                  {hours < 1 ? "1시간 미만" : `${Math.round(hours)}시간`}
                </p>
              }
            />
          );
        })}
        {list.data?.length === 0 && (
          <p className="m-0 rounded-[10px] bg-bg p-3.5 text-[13px] text-sub">
            지금은 조건에 맞는 떡상 후보가 없습니다. 잠시 뒤 새로고침해 보세요.
          </p>
        )}
      </Panel>
      <DraftPanel
        key={selectedId}
        emptyNote="왼쪽 목록에서 영상을 선택하면 초안을 만들 수 있습니다."
        video={selected}
        text={text}
        profile={profile}
        onText={setText}
        onProfile={setProfile}
        onDraft={(d: Draft) => {
          setText(d.comment);
          setProfile(d.profileName);
        }}
      />
    </main>
  );
}
