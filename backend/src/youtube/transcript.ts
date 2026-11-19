/** yt-dlp로 한국어 자막(VTT)을 받아 `"[mm:ss] 문장"` 배열로 돌려준다. 실패·없음은 빈 배열(에러 아님). */
import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parseVtt } from './vtt';

const run = promisify(execFile);
const logger = new Logger('Transcript');

// 수동 자막(ko, ko-ko)을 자동 자막(ko-orig)보다 우선: 사람이 단 쪽이 정확하다
const SUB_SUFFIXES = ['ko.vtt', 'ko-ko.vtt', 'ko-orig.vtt'];

export async function fetchTranscript(videoId: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'ytc-sub-'));
  try {
    await run(
      'yt-dlp',
      [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        'ko,ko-orig',
        '--sub-format',
        'vtt',
        '-o',
        join(dir, '%(id)s'),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 60_000 },
    );
    for (const suffix of SUB_SUFFIXES) {
      try {
        return parseVtt(
          await readFile(join(dir, `${videoId}.${suffix}`), 'utf8'),
        );
      } catch {
        // 해당 자막 파일 없음 → 다음 후보
      }
    }
    logger.log(`자막 없음: ${videoId}`);
    return [];
  } catch (e) {
    logger.warn(
      `yt-dlp 실패(자막 없이 진행): ${videoId} ${(e as Error).message}`,
    );
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
