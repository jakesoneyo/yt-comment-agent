/** YouTube 엔드포인트 입력 DTO. */
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';
import { VIDEO_SOURCES, type VideoSource } from './youtube.types';

export class ListVideosQuery {
  @ApiProperty({ enum: VIDEO_SOURCES })
  @IsIn(VIDEO_SOURCES)
  source!: VideoSource;
}

export class ResolveVideoDto {
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=o7sbcaTQqtU' })
  @IsString()
  @MinLength(1)
  url!: string;
}
