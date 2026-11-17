/** CommentLog.status 값의 단일 출처. SQLite는 Prisma enum을 못 써서 String 컬럼 + 이 상수로 대체. */
export const COMMENT_STATUS = {
  OPENING: 'opening',
  TYPING: 'typing',
  POSTING: 'posting',
  VERIFYING: 'verifying',
  POSTED: 'posted',
  FAILED: 'failed',
} as const;

export type CommentStatus = (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];
