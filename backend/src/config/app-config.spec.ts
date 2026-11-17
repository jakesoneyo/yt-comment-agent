import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, parseConfig } from './app-config';

const examplePath = resolve(__dirname, '../../../config.example.yaml');

describe('parseConfig', () => {
  it('config.example.yaml을 그대로 파싱한다', () => {
    const cfg = loadConfig(examplePath);
    expect(cfg.profiles.map((p) => p.name)).toEqual(['유튜브1', '유튜브2', '유튜브3']);
    expect(cfg.comment).toEqual({ min_chars: 40, max_chars: 120, brand: '운명원' });
    expect(cfg.limits.daily_max_comments).toBe(10);
    expect(cfg.sources.channels).toEqual([]);
  });

  it('YAML 문법 오류는 명확한 메시지로 실패', () => {
    expect(() => parseConfig('profiles: [')).toThrow('config.yaml 파싱 실패');
  });

  it('필수 키 누락 시 키 경로를 메시지에 담는다', () => {
    const src = readFileSync(examplePath, 'utf8').replace('limits: { daily_max_comments: 10 }', '');
    expect(() => parseConfig(src)).toThrow("'limits'");
  });

  it('파일이 없으면 example 복사 안내', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow('config.example.yaml');
  });
});
