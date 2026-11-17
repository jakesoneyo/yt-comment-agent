/**
 * config.yaml 로더·타입. 파싱 실패/필수 키 누락 시 기동 단계에서 바로 죽도록 명확한 Error를 던진다
 * (운영 중에 늦게 터지는 것보다 부팅 실패가 낫다).
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface ProfileConfig {
  name: string;
  dir: string;
  persona: string;
}

export interface AppConfig {
  profiles: ProfileConfig[];
  comment: { min_chars: number; max_chars: number; brand: string };
  limits: { daily_max_comments: number };
  sources: { keywords: string[]; channels: string[]; max_results: number };
}

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`config.yaml: '${path}' 항목이 없거나 객체가 아닙니다`);
  }
  return v as Obj;
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(
      `config.yaml: '${path}.${key}'는 비어 있지 않은 문자열이어야 합니다`,
    );
  }
  return v;
}

function posInt(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (!Number.isInteger(v) || (v as number) <= 0) {
    throw new Error(`config.yaml: '${path}.${key}'는 양의 정수여야 합니다`);
  }
  return v as number;
}

function strArray(o: Obj, key: string, path: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`config.yaml: '${path}.${key}'는 문자열 배열이어야 합니다`);
  }
  return v as string[];
}

/** YAML 문자열을 검증해 AppConfig로 변환한다. @throws Error 파싱 실패·필수 키 누락 시 */
export function parseConfig(source: string): AppConfig {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (e) {
    throw new Error(`config.yaml 파싱 실패: ${(e as Error).message}`);
  }
  const root = obj(raw, '(root)');

  if (!Array.isArray(root.profiles) || root.profiles.length === 0) {
    throw new Error("config.yaml: 'profiles'는 1개 이상의 배열이어야 합니다");
  }
  const profiles = root.profiles.map((p, i) => {
    const o = obj(p, `profiles[${i}]`);
    const path = `profiles[${i}]`;
    return {
      name: str(o, 'name', path),
      dir: str(o, 'dir', path),
      persona: str(o, 'persona', path),
    };
  });
  if (new Set(profiles.map((p) => p.name)).size !== profiles.length) {
    throw new Error("config.yaml: 'profiles[].name'이 중복되었습니다");
  }

  const c = obj(root.comment, 'comment');
  const comment = {
    min_chars: posInt(c, 'min_chars', 'comment'),
    max_chars: posInt(c, 'max_chars', 'comment'),
    brand: str(c, 'brand', 'comment'),
  };
  if (comment.min_chars > comment.max_chars) {
    throw new Error(
      "config.yaml: 'comment.min_chars'가 'max_chars'보다 클 수 없습니다",
    );
  }

  const s = obj(root.sources, 'sources');
  return {
    profiles,
    comment,
    limits: {
      daily_max_comments: posInt(
        obj(root.limits, 'limits'),
        'daily_max_comments',
        'limits',
      ),
    },
    sources: {
      keywords: strArray(s, 'keywords', 'sources'),
      channels: strArray(s, 'channels', 'sources'),
      max_results: posInt(s, 'max_results', 'sources'),
    },
  };
}

/** 파일을 읽어 파싱한다. 파일이 없으면 config.example.yaml 복사 안내를 포함해 던진다. */
export function loadConfig(path: string): AppConfig {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `config.yaml을 읽을 수 없습니다 (${path}). config.example.yaml을 복사해 만드세요`,
    );
  }
  return parseConfig(source);
}
