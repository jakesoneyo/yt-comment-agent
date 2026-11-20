/**
 * Playwright로 실제 크롬 창을 열어 한 글자씩 타이핑해 댓글을 게시하고, 내 댓글을 찾아 고유 링크(lc)를 저장한다.
 * execute는 어떤 경우에도 reject하지 않는다. 실패는 스크린샷과 함께 기록하고 context는 항상 닫는다.
 * 제출 버튼을 누르기 전 실패는 rules.fail(락 해제), 누른 뒤 실패는 rules.unverified(락 유지 — 중복 게시 방지).
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { configPath } from '../config/config.module';
import { COMMENT_STATUS } from '../rules/comment-status';
import { RulesService } from '../rules/rules.service';
import {
  findPostedComment,
  normalizeText,
  type ThreadSnapshot,
} from './comment-match';
import { SEL, TEXT } from './youtube.selectors';

/** 사용자에게 그대로 보여줄 수 있는 실패 사유. 그 외 예외는 "예상치 못한 오류"로 감싼다. */
class PostingError extends Error {}

export interface PostingJob {
  logId: number;
  videoId: string;
  text: string;
  /** config.yaml 기준 상대 경로 */
  profileDir: string;
}

const VERIFY_TIMEOUT_MS = 30_000;
const HOLD_MS = 3_000;
const MAX_SCROLLS = 25;
const THREADS_TO_SCAN = 20;
// 크롬 창을 화면 왼쪽에 두어 대시보드 오른쪽 ③ 진행 칸이 가려지지 않게 한다.
// ponytail: 1710x1112(맥북 기본 해상도) 기준 고정값. 다른 화면에서 쓰면 config.yaml로 뺄 것
const WINDOW_ARGS = ['--window-position=0,0', '--window-size=1340,1080'];

const rand = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));

@Injectable()
export class PostingRunner {
  private readonly logger = new Logger(PostingRunner.name);
  private readonly rootDir = dirname(resolve(configPath()));

  /** 대시보드 라이브 미리보기용: 최신 프레임(JPEG)과 'frame' 이벤트. 마지막 프레임은 다음 게시 전까지 유지 */
  readonly live = new EventEmitter();
  lastFrame: Buffer | null = null;

  constructor(private readonly rules: RulesService) {}

  async execute(job: PostingJob): Promise<void> {
    let ctx: BrowserContext | undefined;
    let page: Page | undefined;
    const state = { submitted: false };
    try {
      ctx = await this.launch(job.profileDir);
      page = ctx.pages()[0] ?? (await ctx.newPage());
      this.lastFrame = null;
      await this.startScreencast(ctx, page);
      const url = await this.post(page, job, state);
      await this.rules.succeed(job.logId, url);
      // 시연용: 내 댓글이 화면에 보이는 채로 잠깐 유지
      await page.waitForTimeout(HOLD_MS);
    } catch (e) {
      await this.recordFailure(job.logId, e, page, state.submitted);
    } finally {
      await ctx?.close().catch(() => undefined);
    }
  }

  /**
   * CDP 스크린캐스트로 크롬 화면을 JPEG 프레임으로 받아 live로 흘린다.
   * 미리보기는 부가 기능이라 실패해도 게시는 계속한다.
   */
  private async startScreencast(ctx: BrowserContext, page: Page) {
    try {
      const cdp = await ctx.newCDPSession(page);
      cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
        this.lastFrame = Buffer.from(data, 'base64');
        this.live.emit('frame', this.lastFrame);
        // ack를 보내야 다음 프레임이 온다
        void cdp
          .send('Page.screencastFrameAck', { sessionId })
          .catch(() => undefined);
      });
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 60,
        maxWidth: 1280,
        maxHeight: 1280,
      });
    } catch (e) {
      this.logger.warn(`라이브 미리보기 시작 실패: ${(e as Error).message}`);
    }
  }

  /** 프로필이 다른 크롬 창에서 열려 있으면 launch가 실패하므로 그 경우를 사람이 알아볼 문구로 분류한다. */
  private async launch(profileDir: string): Promise<BrowserContext> {
    try {
      return await chromium.launchPersistentContext(
        resolve(this.rootDir, profileDir),
        {
          channel: 'chrome',
          headless: false,
          locale: 'ko-KR',
          args: ['--lang=ko-KR', ...WINDOW_ARGS],
          viewport: null,
          // 로그인은 일반 크롬으로 한 프로필이라 쿠키가 실제 키체인 키로 암호화돼 있다.
          // Playwright 기본값(--use-mock-keychain)이면 복호화 실패 → 로그아웃 상태로 보이고 쿠키도 버려진다.
          ignoreDefaultArgs: ['--use-mock-keychain'],
        },
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (
        /existing browser session|ProcessSingleton|has been closed|SingletonLock/i.test(
          msg,
        )
      ) {
        throw new PostingError(
          '프로필이 다른 크롬 창에서 열려 있습니다. 해당 창을 닫으세요',
        );
      }
      throw new PostingError(
        `크롬을 실행하지 못했습니다: ${msg.split('\n')[0]}`,
      );
    }
  }

  private async post(
    page: Page,
    job: PostingJob,
    state: { submitted: boolean },
  ): Promise<string> {
    const { logId, videoId, text } = job;

    await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, {
      waitUntil: 'domcontentloaded',
    });
    await this.assertLoggedIn(page);
    await this.scrollToComments(page);

    await this.rules.markStatus(logId, COMMENT_STATUS.TYPING);
    await page.locator(SEL.placeholder).click();
    await page.locator(SEL.input).click();
    // 코드포인트 단위: 이모지 등 surrogate pair가 쪼개져 깨지지 않게
    for (const ch of [...text]) {
      await page.keyboard.type(ch, { delay: rand(80, 180) });
    }

    // 입력창이 글자를 흘리면 원문과 다른 댓글이 달리므로 제출 전에 대조한다
    const typed = await page.locator(SEL.input).innerText();
    if (normalizeText(typed) !== normalizeText(text)) {
      throw new PostingError('입력된 내용이 원문과 달라 게시를 중단했습니다');
    }

    await this.rules.markStatus(logId, COMMENT_STATUS.POSTING);
    // 클릭 직전에 표시: 클릭이 예외를 던져도 실제로는 게시됐을 수 있다
    state.submitted = true;
    await page.locator(SEL.submit).click();

    await this.rules.markStatus(logId, COMMENT_STATUS.VERIFYING);
    const { index, lc } = await this.findMyComment(page, text);
    await page.locator(SEL.thread).nth(index).scrollIntoViewIfNeeded();
    return `https://www.youtube.com/watch?v=${videoId}&lc=${lc}`;
  }

  private async assertLoggedIn(page: Page): Promise<void> {
    const avatar = page.locator(SEL.avatar);
    // 아바타(로그인) 또는 로그인 버튼(비로그인) 중 먼저 뜨는 쪽으로 페이지 로딩 완료를 판단
    await avatar
      .or(page.locator(SEL.loginLink))
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    if ((await avatar.count()) === 0) {
      throw new PostingError(
        '로그인 필요: 이 프로필의 크롬에서 유튜브에 로그인하세요',
      );
    }
  }

  /** 댓글은 스크롤해야 지연 로딩되므로 입력창이 보일 때까지 조금씩 내리며 기다린다. */
  private async scrollToComments(page: Page): Promise<void> {
    for (let i = 0; i < MAX_SCROLLS; i++) {
      if (await page.locator(SEL.commentsOff).first().isVisible()) {
        throw new PostingError('이 영상은 댓글 사용이 중지되어 있습니다');
      }
      if (await page.locator(SEL.placeholder).first().isVisible()) return;
      await page.evaluate(() => window.scrollBy(0, 700));
      await page.waitForTimeout(600);
    }
    throw new PostingError('댓글 영역을 찾지 못했습니다');
  }

  private async findMyComment(
    page: Page,
    text: string,
  ): Promise<{ index: number; lc: string }> {
    const deadline = Date.now() + VERIFY_TIMEOUT_MS;
    do {
      // 정렬을 다시 고르면 댓글 목록을 서버에서 새로 받아온다.
      // 게시 직후엔 서버 반영이 늦어 첫 조회에 빠질 수 있으므로 매 회차 다시 받는다.
      await page.locator(`${SEL.sortTrigger}:visible`).first().click();
      await page
        .locator(SEL.sortItem)
        .filter({ hasText: TEXT.newest })
        .first()
        .click();
      await page.waitForTimeout(3000);
      const threads: ThreadSnapshot[] = await page.$$eval(
        SEL.thread,
        (els, s) =>
          els.slice(0, s.n).map((el) => ({
            text: el.querySelector(s.body)?.textContent ?? '',
            href: el.querySelector(s.time)?.getAttribute('href') ?? null,
          })),
        { n: THREADS_TO_SCAN, body: SEL.body, time: SEL.timeLink },
      );
      const found = findPostedComment(threads, text);
      if (found) return found;
    } while (Date.now() < deadline);
    throw new PostingError(
      '게시 확인 실패: 최신 댓글에서 내 댓글을 찾지 못했습니다',
    );
  }

  private async recordFailure(
    logId: number,
    e: unknown,
    page: Page | undefined,
    submitted: boolean,
  ) {
    const reason =
      e instanceof PostingError
        ? e.message
        : `예상치 못한 오류: ${(e as Error).message.split('\n')[0]}`;
    this.logger.warn(`게시 실패 #${logId}: ${reason}`);

    const rel = `screenshots/${logId}.png`;
    let shot: string | undefined;
    try {
      if (page) {
        await mkdir(resolve(this.rootDir, 'screenshots'), { recursive: true });
        await page.screenshot({ path: resolve(this.rootDir, rel) });
        shot = rel;
      }
    } catch {
      // 스크린샷 실패가 실패 기록 자체를 막으면 안 됨
    }
    if (submitted) {
      await this.rules.unverified(
        logId,
        `${reason} (게시됐을 수 있음, 영상에서 직접 확인 필요)`,
        shot,
      );
    } else {
      await this.rules.fail(logId, reason, shot);
    }
  }
}
