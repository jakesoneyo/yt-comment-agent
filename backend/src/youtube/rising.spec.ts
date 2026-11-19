import { isRising } from './rising';

const now = new Date('2026-11-19T12:00:00Z');
const ago = (h: number) =>
  new Date(now.getTime() - h * 3_600_000).toISOString();

describe('isRising', () => {
  it('범위 안 + 시간당 150 이상이면 true', () => {
    expect(isRising(3000, ago(10), now)).toBe(true); // 300/h
    expect(isRising(1500, ago(10), now)).toBe(true); // 정확히 150/h
  });
  it('조회수 범위 밖이면 false', () => {
    expect(isRising(999, ago(1), now)).toBe(false);
    expect(isRising(5001, ago(1), now)).toBe(false);
  });
  it('시간당 속도 미달이면 false', () => {
    expect(isRising(1400, ago(10), now)).toBe(false); // 140/h
  });
  it('방금 올라온 영상도 0 나누기 없이 판정', () => {
    expect(isRising(1000, now.toISOString(), now)).toBe(true);
  });
});
