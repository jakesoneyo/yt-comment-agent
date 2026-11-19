/**
 * 백엔드 REST 클라이언트와 응답 타입의 단일 출처.
 * 타입은 backend 컨트롤러/서비스 응답(youtube.types.ts, draft.service.ts, Prisma CommentLog)에 맞춘다.
 */
import axios from "axios";

export const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const http = axios.create({ baseURL: API });

/** 서버 config의 comment.max_chars와 같은 값. 응답에 내려오지 않아 여기 한 곳에서만 둔다. */
export const MAX_CHARS = 120;

/** 값은 backend/src/rules/comment-status.ts 의 COMMENT_STATUS와 동일해야 한다. */
export const COMMENT_STATUS = {
  OPENING: "opening",
  TYPING: "typing",
  POSTING: "posting",
  VERIFYING: "verifying",
  POSTED: "posted",
  FAILED: "failed",
  UNVERIFIED: "unverified",
} as const;
export type CommentStatus =
  (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];

/** 폴링을 멈추는 종료 상태 */
export const isTerminal = (s: string) =>
  s === COMMENT_STATUS.POSTED ||
  s === COMMENT_STATUS.FAILED ||
  s === COMMENT_STATUS.UNVERIFIED;

export type VideoSource = "keyword" | "channel" | "rising";

export interface Video {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  commentCount: number;
  done: boolean;
}

export interface Evidence {
  ts: string;
  quote: string;
  keyword: string;
}

export interface Draft {
  id: number;
  videoId: string;
  profileName: string;
  concern: string;
  evidence: Evidence[];
  comment: string;
  viewer_tone: string;
  validation: {
    ok: boolean;
    violations: string[];
    /** violations와 같은 순서의 규칙 ID(backend comment-validator.ts RuleId). 예전 초안엔 없을 수 있음 */
    failed?: string[];
    attempts: number;
  };
}

export interface CommentLog {
  id: number;
  videoId: string;
  videoTitle: string;
  profileName: string;
  text: string;
  status: CommentStatus;
  commentUrl: string | null;
  error: string | null;
  screenshotPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  used: number;
  limit: number;
  perProfile: Record<string, number>;
}

export const getVideos = (source: VideoSource) =>
  http.get<Video[]>("/videos", { params: { source } }).then((r) => r.data);
export const resolveVideo = (url: string) =>
  http.post<Video>("/videos/resolve", { url }).then((r) => r.data);
export const createDraft = (videoId: string, profileName?: string) =>
  http.post<Draft>("/drafts", { videoId, profileName }).then((r) => r.data);
export const postComment = (body: {
  videoId: string;
  profileName: string;
  text: string;
}) => http.post<{ logId: number }>("/comments", body).then((r) => r.data);
export const getComment = (id: number) =>
  http.get<CommentLog>(`/comments/${id}`).then((r) => r.data);
export const getComments = () =>
  http.get<CommentLog[]>("/comments").then((r) => r.data);
export const getStats = () =>
  http.get<Stats>("/stats/today").then((r) => r.data);

export const screenshotUrl = (path: string) => `${API}/${path}`;

/** Nest 에러 본문(message 문자열/배열, violations)을 화면용 한 줄로 만든다. 서버 미응답은 별도 문구. */
export function errorMessage(e: unknown): string {
  if (!axios.isAxiosError(e)) return "알 수 없는 오류가 발생했습니다";
  if (!e.response)
    return "서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인하세요";
  const d = e.response.data as
    { message?: string | string[]; violations?: string[] } | undefined;
  const msg = Array.isArray(d?.message)
    ? d.message.join(", ")
    : (d?.message ?? `오류 (${e.response.status})`);
  return d?.violations?.length ? `${msg}: ${d.violations.join(" / ")}` : msg;
}
