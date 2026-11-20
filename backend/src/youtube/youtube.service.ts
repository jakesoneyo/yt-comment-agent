/**
 * YouTube Data API v3(fetch) 기반 영상 조회 + 초안 생성용 맥락(설명·인기 댓글·자막) 수집.
 * 외부 API 오류는 전부 502(BadGateway)로 사유를 담아 일관되게 던진다.
 */
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { isRising } from './rising';
import { fetchTranscript } from './transcript';
import { parseVideoId } from './video-url';
import type { VideoContext, VideoSource, VideoSummary } from './youtube.types';

const API = 'https://www.googleapis.com/youtube/v3';

/** API 오류 사유(reason)를 보존해 호출부가 "댓글 사용 중지" 같은 정상 케이스를 구분하게 한다. */
class YoutubeApiError extends BadGatewayException {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(`YouTube API 오류: ${message}`);
  }
}

interface VideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: Record<string, { url: string }>;
  };
  statistics?: { viewCount?: string; commentCount?: string };
}

@Injectable()
export class YoutubeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async api<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key)
      throw new BadGatewayException('YOUTUBE_API_KEY가 설정되지 않았습니다');
    const qs = new URLSearchParams({ ...params, key });
    let res: Response;
    try {
      res = await fetch(`${API}/${path}?${qs}`);
    } catch (e) {
      throw new BadGatewayException(
        `YouTube API 연결 실패: ${(e as Error).message}`,
      );
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; errors?: { reason?: string }[] };
      };
      const reason = body.error?.errors?.[0]?.reason ?? String(res.status);
      throw new YoutubeApiError(
        reason,
        reason === 'quotaExceeded'
          ? '일일 쿼터를 초과했습니다'
          : (body.error?.message ?? `HTTP ${res.status}`),
      );
    }
    return (await res.json()) as T;
  }

  /** 소스별 영상 목록. 모든 소스가 videos.list로 보강되고, done은 VideoLock 존재 여부. */
  async listVideos(source: VideoSource): Promise<VideoSummary[]> {
    const { keywords, channels, max_results } = this.config.sources;
    let ids: string[];
    if (source === 'channel') {
      ids = (
        await Promise.all(
          channels.map((c) => this.channelUploads(c, max_results)),
        )
      ).flat();
    } else {
      const rising = source === 'rising';
      const extra: Record<string, string | number> = rising
        ? {
            publishedAfter: new Date(Date.now() - 48 * 3_600_000).toISOString(),
            // 조회수순이면 이미 수십만 회인 영상만 와서 1,000~5,000 구간이 비게 된다.
            // 최신순 50개 중 몇 시간 만에 1,000회를 넘긴 영상이 '뜨기 직전' 후보
            order: 'date',
            maxResults: 50,
          }
        : { order: 'date', maxResults: max_results }; // 과제 요구: [영상 불러오기]는 최신 영상
      ids = (
        await Promise.all(keywords.map((q) => this.search(q, extra)))
      ).flat();
    }
    const videos = await this.fetchVideos([...new Set(ids)]);
    const picked =
      source === 'rising'
        ? videos.filter((v) =>
            isRising(
              Number(v.statistics?.viewCount ?? 0),
              v.snippet.publishedAt,
            ),
          )
        : videos;
    return this.summarize(picked);
  }

  /** URL 또는 ID 한 건을 목록과 같은 형식으로 변환. @throws 400 잘못된 URL, 404 없는 영상 */
  async resolve(input: string): Promise<VideoSummary> {
    const id = parseVideoId(input);
    if (!id) throw new BadRequestException('유튜브 영상 링크 형식이 아닙니다');
    const [video] = await this.fetchVideos([id]);
    if (!video) throw new NotFoundException('영상을 찾을 수 없습니다');
    return (await this.summarize([video]))[0];
  }

  /** 초안 생성 입력: 제목·채널·설명 + 인기 댓글 20개 + 자막. @throws 404 없는 영상 */
  async getContext(videoId: string): Promise<VideoContext> {
    const [video] = await this.fetchVideos([videoId]);
    if (!video) throw new NotFoundException('영상을 찾을 수 없습니다');
    const [topComments, transcript] = await Promise.all([
      this.topComments(videoId),
      fetchTranscript(videoId),
    ]);
    return {
      videoId,
      title: video.snippet.title,
      channelTitle: video.snippet.channelTitle,
      description: video.snippet.description,
      topComments,
      transcript,
    };
  }

  private async search(
    q: string,
    extra: Record<string, string | number>,
  ): Promise<string[]> {
    const res = await this.api<{ items: { id: { videoId: string } }[] }>(
      'search',
      {
        part: 'snippet',
        type: 'video',
        q,
        regionCode: 'KR',
        relevanceLanguage: 'ko',
        ...extra,
      },
    );
    return res.items.map((i) => i.id.videoId);
  }

  private async channelUploads(
    channelId: string,
    max: number,
  ): Promise<string[]> {
    const ch = await this.api<{
      items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[];
    }>('channels', { part: 'contentDetails', id: channelId });
    const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
    if (!uploads) return [];
    const res = await this.api<{
      items: { contentDetails: { videoId: string } }[];
    }>('playlistItems', {
      part: 'contentDetails',
      playlistId: uploads,
      maxResults: max,
    });
    return res.items.map((i) => i.contentDetails.videoId);
  }

  /** videos.list는 1회 50개 제한이라 청크로 나눠 호출하고, 입력 ID 순서를 유지한다. */
  private async fetchVideos(ids: string[]): Promise<VideoItem[]> {
    const items: VideoItem[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const res = await this.api<{ items: VideoItem[] }>('videos', {
        part: 'snippet,statistics',
        id: ids.slice(i, i + 50).join(','),
      });
      items.push(...res.items);
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  private async summarize(videos: VideoItem[]): Promise<VideoSummary[]> {
    const locks = await this.prisma.videoLock.findMany({
      where: { videoId: { in: videos.map((v) => v.id) } },
      select: { videoId: true },
    });
    const done = new Set(locks.map((l) => l.videoId));
    return videos.map((v) => ({
      videoId: v.id,
      title: v.snippet.title,
      channelTitle: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      thumbnailUrl:
        v.snippet.thumbnails?.medium?.url ??
        v.snippet.thumbnails?.default?.url ??
        '',
      viewCount: Number(v.statistics?.viewCount ?? 0),
      commentCount: Number(v.statistics?.commentCount ?? 0),
      done: done.has(v.id),
    }));
  }

  /** 댓글 사용 중지(403 commentsDisabled)는 빈 배열 — 초안은 댓글 없이도 쓸 수 있다. */
  private async topComments(videoId: string): Promise<string[]> {
    try {
      const res = await this.api<{
        items: {
          snippet: { topLevelComment: { snippet: { textDisplay: string } } };
        }[];
      }>('commentThreads', {
        part: 'snippet',
        videoId,
        maxResults: 20,
        order: 'relevance',
        textFormat: 'plainText',
      });
      return res.items.map(
        (i) => i.snippet.topLevelComment.snippet.textDisplay,
      );
    } catch (e) {
      if (e instanceof YoutubeApiError && e.reason === 'commentsDisabled')
        return [];
      throw e;
    }
  }
}
