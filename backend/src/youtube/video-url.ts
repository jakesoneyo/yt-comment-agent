/** 유튜브 URL/ID 파싱(순수 함수). watch?v=, youtu.be/, shorts/, 순수 ID 11자를 모두 받는다. */

const ID = /^[\w-]{11}$/;

/** 영상 ID를 추출한다. 형식이 아니면 null (호출부가 400으로 변환). */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  let candidate: string | null | undefined;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1];
  } else if (host === 'youtube.com') {
    candidate =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : /^\/(shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[2];
  }
  return candidate && ID.test(candidate) ? candidate : null;
}
