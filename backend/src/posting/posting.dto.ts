/** POST /comments 입력 DTO. 길이·규칙 검증은 서버의 validateComment가 맡는다(여기선 형식만). */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'o7sbcaTQqtU' })
  @Matches(/^[\w-]{11}$/, { message: 'videoId는 11자 영상 ID여야 합니다' })
  videoId!: string;

  @ApiProperty({ example: '유튜브1' })
  @IsString()
  @IsNotEmpty()
  profileName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  text!: string;
}
