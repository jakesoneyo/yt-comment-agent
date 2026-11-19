/** 떡상 후보 판정(순수 함수): 조회수 1,000~5,000 이고 게시 후 시간당 조회수 ≥ 150. */

export const RISING = { minViews: 1000, maxViews: 5000, minPerHour: 150 };

export function isRising(
  viewCount: number,
  publishedAt: string,
  now = new Date(),
): boolean {
  if (viewCount < RISING.minViews || viewCount > RISING.maxViews) return false;
  const hours = (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000;
  // 막 올라온 영상의 0 나누기를 막기 위해 최소 1분으로 클램프
  return viewCount / Math.max(hours, 1 / 60) >= RISING.minPerHour;
}
