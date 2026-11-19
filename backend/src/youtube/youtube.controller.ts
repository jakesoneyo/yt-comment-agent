/** 영상 목록 조회와 링크 직접 입력 엔드포인트. */
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListVideosQuery, ResolveVideoDto } from './youtube.dto';
import { YoutubeService } from './youtube.service';

@ApiTags('videos')
@Controller('videos')
export class YoutubeController {
  constructor(private readonly youtube: YoutubeService) {}

  @Get()
  list(@Query() q: ListVideosQuery) {
    return this.youtube.listVideos(q.source);
  }

  @Post('resolve')
  @HttpCode(200)
  resolve(@Body() dto: ResolveVideoDto) {
    return this.youtube.resolve(dto.url);
  }
}
