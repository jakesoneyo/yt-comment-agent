/** 댓글 초안 생성 엔드포인트. */
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateDraftDto } from './draft.dto';
import { DraftService } from './draft.service';

@ApiTags('drafts')
@Controller('drafts')
export class DraftController {
  constructor(private readonly drafts: DraftService) {}

  @Post()
  create(@Body() dto: CreateDraftDto) {
    return this.drafts.generate(dto.videoId, dto.profileName);
  }
}
