/** CommentLog.status 값의 단일 출처. SQLite는 Prisma enum을 못 써서 String 컬럼 + 이 상수로 대체. */
export const COMMENT_STATUS = {
  OPENING: 'opening',
  TYPING: 'typing',
  POSTING: 'posting',
  VERIFYING: 'verifying',
  POSTED: 'posted',
  FAILED: 'failed',
  /** 게시 버튼은 눌렀지만 확인 실패. 실제로 달렸을 수 있어 락 유지·상한 포함 */
  UNVERIFIED: 'unverified',
} as const;

export type CommentStatus =
  (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];
