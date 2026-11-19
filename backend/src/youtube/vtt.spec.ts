import { parseVtt } from './vtt';

describe('parseVtt', () => {
  it('헤더·인라인 태그·연속 중복 줄을 정리한다', () => {
    const vtt = `WEBVTT
Kind: captions
Language: ko

00:00:00.000 --> 00:00:02.000 align:start position:0%
안녕하세요<00:00:00.440><c> 여러분</c>

00:00:02.000 --> 00:00:02.010 align:start position:0%
안녕하세요 여러분

00:00:02.010 --> 00:01:05.000 align:start position:0%
안녕하세요 여러분
썸 타는 &amp; 연락

1:02:03.000 --> 1:02:05.000
마지막
`;
    expect(parseVtt(vtt)).toEqual([
      '[00:00] 안녕하세요 여러분',
      '[00:02] 썸 타는 & 연락',
      '[62:03] 마지막',
    ]);
  });

  it('빈 입력은 빈 배열', () => {
    expect(parseVtt('WEBVTT\n\n')).toEqual([]);
  });
});
