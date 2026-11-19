/** WebVTT → `"[mm:ss] 문장"` 배열(순수 함수). 자동 자막의 롤링 중복·인라인 태그를 정리한다. */

const TIMING = /^(?:(\d+):)?(\d{2}):(\d{2})\.\d{3}\s+-->/;
const TAG = /<[^>]*>/g;

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseVtt(vtt: string): string[] {
  const out: string[] = [];
  let ts = '00:00';
  let last = '';
  for (const raw of vtt.split(/\r?\n/)) {
    const timing = TIMING.exec(raw);
    if (timing) {
      const minutes = Number(timing[1] ?? 0) * 60 + Number(timing[2]);
      ts = `${String(minutes).padStart(2, '0')}:${timing[3]}`;
      continue;
    }
    // 헤더·NOTE·STYLE 줄은 자막이 아님(유튜브 VTT는 큐 번호가 없어 숫자 대사는 보존)
    if (/^(WEBVTT|Kind:|Language:|NOTE|STYLE)/.test(raw)) continue;
    const text = decode(raw.replace(TAG, '')).replace(/\s+/g, ' ').trim();
    // 자동 자막은 직전 줄을 다음 큐에서 반복(롤링)하므로 연속 중복 제거
    if (!text || text === last) continue;
    out.push(`[${ts}] ${text}`);
    last = text;
  }
  return out;
}
