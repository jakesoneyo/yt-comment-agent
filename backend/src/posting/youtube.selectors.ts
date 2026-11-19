/** YouTube 데스크톱 DOM 셀렉터 모음. UI가 바뀌면 이 파일만 고친다. */
export const SEL = {
  avatar: 'button#avatar-btn',
  loginLink: 'a[href*="ServiceLogin"]',
  commentsSection: 'ytd-comments#comments',
  commentsOff: 'ytd-comments ytd-message-renderer',
  placeholder: '#simplebox-placeholder',
  input: '#contenteditable-root',
  submit: '#submit-button',
  sortTrigger: 'yt-sort-filter-sub-menu-renderer #trigger',
  sortItem: 'tp-yt-paper-listbox a',
  thread: 'ytd-comment-thread-renderer',
  body: '#content-text',
  timeLink: '#published-time-text a',
} as const;

export const TEXT = {
  newest: '최신순',
} as const;
