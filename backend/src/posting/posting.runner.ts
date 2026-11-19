/**
 * Playwright로 실제 크롬 창을 열어 한 글자씩 타이핑해 댓글을 게시하고, 내 댓글을 찾아 고유 링크(lc)를 저장한다.
 * execute는 어떤 경우에도 reject하지 않는다 — 실패는 스크린샷과 함께 rules.fail로 기록하고 context는 항상 닫는다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { configPath } from '../config/config.module';
import { COMMENT_STATUS } from '../rules/comment-status';
import { RulesService } from '../rules/rules.service';
import { findPostedComment, type ThreadSnapshot } from './comment-match';
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

const VERIFY_TIMEOUT_MS = 15_000;
const HOLD_MS = 3_000;
const MAX_SCROLLS = 25;
const THREADS_TO_SCAN = 20;

const rand = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));

@Injectable()
export class PostingRunner {
  private readonly logger = new Logger(PostingRunner.name);
  private readonly rootDir = dirname(resolve(configPath()));

  constructor(private readonly rules: RulesService) {}

  async execute(job: PostingJob): Promise<void> {
    let ctx: BrowserContext | undefined;
    let page: Page | undefined;
    try {
      ctx = await this.launch(job.profileDir);
      page = ctx.pages()[0] ?? (await ctx.newPage());
      const url = await this.post(page, job);
      await this.rules.succeed(job.logId, url);
      // 시연용: 내 댓글이 화면에 보이는 채로 잠깐 유지
      await page.waitForTimeout(HOLD_MS);
    } catch (e) {
      await this.recordFailure(job.logId, e, page);
    } finally {
      await ctx?.close().catch(() => undefined);
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
          args: ['--lang=ko-KR'],
          viewport: null,
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

  private async post(page: Page, job: PostingJob): Promise<string> {
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

    await this.rules.markStatus(logId, COMMENT_STATUS.POSTING);
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
    await page.locator(`${SEL.sortTrigger}:visible`).first().click();
    await page
      .locator(SEL.sortItem)
      .filter({ hasText: TEXT.newest })
      .first()
      .click();

    const deadline = Date.now() + VERIFY_TIMEOUT_MS;
    do {
      await page.waitForTimeout(1000);
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

  private async recordFailure(logId: number, e: unknown, page?: Page) {
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
    await this.rules.fail(logId, reason, shot);
  }
}
