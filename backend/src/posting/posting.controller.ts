/** 댓글 게시·진행 상태·기록·오늘 통계 엔드포인트. */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CreateCommentDto } from './posting.dto';
import { PostingRunner } from './posting.runner';
import { PostingService } from './posting.service';

@ApiTags('comments')
@Controller()
export class PostingController {
  constructor(
    private readonly posting: PostingService,
    private readonly runner: PostingRunner,
  ) {}

  /**
   * 게시 중인 크롬 화면을 MJPEG로 흘려보낸다. 브라우저 <img>가 multipart/x-mixed-replace를
   * 기본 지원해서 프론트는 폴링 없이 src만 걸면 된다. 연결 즉시 최신 프레임 1장을 먼저 보낸다.
   */
  @Get('posting/live')
  @ApiProduces('multipart/x-mixed-replace')
  live(@Req() req: Request, @Res() res: Response) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store',
    });
    res.flushHeaders();
    const send = (jpg: Buffer) => {
      res.write(
        `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`,
      );
      res.write(jpg);
      res.write('\r\n');
    };
    if (this.runner.lastFrame) send(this.runner.lastFrame);
    this.runner.live.on('frame', send);
    req.on('close', () => this.runner.live.off('frame', send));
  }

  @Post('comments')
  start(@Body() dto: CreateCommentDto) {
    return this.posting.start(dto);
  }

  @Get('comments')
  list() {
    return this.posting.list();
  }

  @Get('comments/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.posting.get(id);
  }

  @Get('stats/today')
  stats() {
    return this.posting.stats();
  }
}
