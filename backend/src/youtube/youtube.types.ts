/** YouTube 모듈이 밖으로 내보내는 응답 타입의 단일 출처. */

export const VIDEO_SOURCES = ['keyword', 'channel', 'rising'] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

export interface VideoSummary {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  commentCount: number;
  /** VideoLock이 있으면 true(이미 달았거나 진행 중) */
  done: boolean;
}

export interface VideoContext {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  topComments: string[];
  /** "[mm:ss] 문장" 줄 목록. 자막이 없으면 빈 배열 */
  transcript: string[];
}
