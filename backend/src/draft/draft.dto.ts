/** POST /drafts 입력 DTO. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateDraftDto {
  @ApiProperty({ example: 'o7sbcaTQqtU' })
  @Matches(/^[\w-]{11}$/, { message: 'videoId는 11자 영상 ID여야 합니다' })
  videoId!: string;

  @ApiPropertyOptional({ description: '없으면 오늘 사용량이 가장 적은 프로필' })
  @IsOptional()
  @IsString()
  profileName?: string;
}
