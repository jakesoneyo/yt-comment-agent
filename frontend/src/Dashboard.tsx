/** 대시보드 탭: ① 영상 불러오기(소스 토글·링크 입력) + ② DraftPanel + ③ PostPanel 3칸. 선택·초안 상태는 여기서 들고 내려준다. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import {
  errorMessage,
  getVideos,
  resolveVideo,
  type Draft,
  type Video,
  type VideoSource,
} from "./api";
import { DraftPanel } from "./DraftPanel";
import { PostPanel } from "./PostPanel";
import { btnGhost, btnPri, CardSkeleton, Panel, VideoCard } from "./ui";

const SOURCES: [VideoSource, string][] = [
  ["keyword", "키워드 '연애'"],
  ["channel", "테스트 채널"],
];

export function Dashboard() {
  const qc = useQueryClient();
  const [source, setSource] = useState<VideoSource>("channel");
  // 불러오기 버튼을 누른 소스만 조회(검색 API 쿼터와 빈 화면 안내를 위해 자동 로드 안 함)
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [profile, setProfile] = useState("");
  const [url, setUrl] = useState("");

  const list = useQuery({
    queryKey: ["videos", source],
    queryFn: () => getVideos(source),
    enabled: loaded[source],
  });
  // 링크로 추가한 영상은 소스와 무관하게 목록 맨 위에 쌓이는 별도 캐시 항목
  const added = useQuery<Video[]>({
    queryKey: ["videos", "link"],
    queryFn: () => [],
    enabled: false,
    initialData: [],
  });
  const add = useMutation({
    mutationFn: resolveVideo,
    onSuccess: (v) => {
      qc.setQueryData<Video[]>(["videos", "link"], (old = []) => [
        v,
        ...old.filter((o) => o.videoId !== v.videoId),
      ]);
      setUrl("");
      pick(v);
    },
  });

  const videos = [
    ...(added.data ?? []),
    ...(list.data ?? []).filter(
      (v) => !added.data?.some((a) => a.videoId === v.videoId),
    ),
  ];
  const selected = videos.find((v) => v.videoId === selectedId) ?? null;

  function pick(v: Video) {
    setSelectedId(v.videoId);
    setText(null);
    setProfile("");
  }
  function onDraft(d: Draft) {
    setText(d.comment);
    setProfile(d.profileName);
  }

  return (
    <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 px-6 py-4 min-[1100px]:min-h-[calc(100dvh-60px)] min-[1100px]:grid-cols-[340px_1fr_320px]">
      <Panel
        n={1}
        title="영상 불러오기"
        right={videos.length ? `${videos.length}개` : undefined}
      >
        <div
          className="grid grid-cols-2 rounded-lg bg-bg p-[3px]"
          role="group"
          aria-label="영상 소스"
        >
          {SOURCES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={source === k}
              onClick={() => setSource(k)}
              className={`cursor-pointer rounded-md p-2 ${source === k ? "bg-panel font-semibold text-ink shadow-sm" : "text-sub"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={selected || videos.length ? btnGhost : btnPri}
          disabled={list.isFetching}
          onClick={() =>
            loaded[source]
              ? void list.refetch()
              : setLoaded({ ...loaded, [source]: true })
          }
        >
          <RefreshCw
            size={16}
            className={list.isFetching ? "animate-spin" : ""}
            aria-hidden
          />
          영상 불러오기
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) add.mutate(url.trim());
          }}
        >
          <label htmlFor="link" className="text-xs font-semibold text-sub">
            링크로 추가
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              id="link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="youtube.com/watch?v=..."
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-2"
            />
            <button
              type="submit"
              className={btnGhost}
              disabled={add.isPending || !url.trim()}
            >
              추가
            </button>
          </div>
          {add.isError && (
            <p role="alert" className="m-0 mt-1.5 text-xs text-bad">
              {errorMessage(add.error)}
            </p>
          )}
        </form>
        {list.isError && (
          <p
            role="alert"
            className="m-0 rounded-[10px] bg-bad-soft p-3 text-[13px] text-bad"
          >
            {errorMessage(list.error)}
          </p>
        )}
        <div>
          {list.isFetching &&
            !list.data &&
            [0, 1, 2].map((i) => <CardSkeleton key={i} />)}
          {videos.map((v) => (
            <VideoCard
              key={v.videoId}
              v={v}
              selected={v.videoId === selectedId}
              onSelect={() => pick(v)}
            />
          ))}
          {videos.length === 0 && !list.isFetching && !list.isError && (
            <p className="m-0 rounded-[10px] bg-bg p-3.5 text-[13px] leading-normal text-sub">
              {loaded[source]
                ? "불러온 영상이 없습니다. config.yaml의 키워드/채널 설정을 확인하거나 링크로 직접 추가하세요."
                : "[영상 불러오기]를 누르거나 링크를 붙여 넣어 시작하세요."}
            </p>
          )}
        </div>
      </Panel>
      <DraftPanel
        key={selectedId}
        video={selected}
        text={text}
        profile={profile}
        onText={setText}
        onProfile={setProfile}
        onDraft={onDraft}
      />
      <PostPanel
        key={`p-${selectedId}`}
        video={selected}
        text={text}
        profile={profile}
      />
    </main>
  );
}
