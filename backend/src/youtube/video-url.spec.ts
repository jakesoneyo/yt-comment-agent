import { parseVideoId } from './video-url';

describe('parseVideoId', () => {
  const id = 'o7sbcaTQqtU';
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?v=${id}&t=30s&lc=abc`,
    `https://m.youtube.com/watch?v=${id}`,
    `youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=xyz`,
    `https://www.youtube.com/shorts/${id}`,
    `  ${id}  `,
  ])('%s → ID', (input) => {
    expect(parseVideoId(input)).toBe(id);
  });

  it.each([
    '',
    'hello',
    'https://example.com/watch?v=o7sbcaTQqtU',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/UCy8ecjqNSA5rmtrtEYVHxNQ',
  ])('%s → null', (input) => {
    expect(parseVideoId(input)).toBeNull();
  });
});
