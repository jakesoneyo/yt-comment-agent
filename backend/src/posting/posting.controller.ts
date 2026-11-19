/** 댓글 게시·진행 상태·기록·오늘 통계 엔드포인트. */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateCommentDto } from './posting.dto';
import { PostingService } from './posting.service';

@ApiTags('comments')
@Controller()
export class PostingController {
  constructor(private readonly posting: PostingService) {}

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
