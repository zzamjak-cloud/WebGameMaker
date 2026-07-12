import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type GamePhase = 'loading' | 'playing' | 'won' | 'lost' | 'destroyed' | 'error';

interface VerticalSliceSnapshot {
  phase: GamePhase;
  run: { runId: number; restartCount: number; elapsedMs: number };
  input: { focused: boolean; pressedKeys: string[] };
  player: { x: number; y: number; health: number; maxHealth: number };
  resources: {
    canvasCount: number;
    listeners: number;
    timers: number;
    orphanCanvases: number;
    orphanListeners: number;
    orphanTimers: number;
  };
}

interface VerticalSliceApi {
  version: 1;
  snapshot: () => VerticalSliceSnapshot;
  advanceTicks: (count: number) => Promise<VerticalSliceSnapshot>;
  restart: () => Promise<VerticalSliceSnapshot>;
}

interface CompatibilitySnapshot {
  phase: string;
  resources: {
    canvasCount: number;
    orphanCanvases: number;
    orphanListeners: number;
    orphanTimers: number;
  };
}

interface CompatibilityApi {
  snapshot: () => CompatibilitySnapshot;
  recreate: (cycles?: number) => Promise<CompatibilitySnapshot>;
}

type ExportWindow = Window & {
  __WGM_VERTICAL_SLICE_TEST__?: VerticalSliceApi;
  __WGM_PLAYER_TEST__?: CompatibilityApi;
};

interface PageErrorLog {
  consoleErrors: string[];
  pageErrors: string[];
}

interface VisualBaseline {
  schemaVersion: 1;
  generatedBy: string;
  viewport: { width: number; height: number };
  samples: Record<string, { path: string; width: number; height: number; sha256: string }>;
}

const baselinePath = path.join(process.cwd(), 'tests/visual/export-baseline.json');
const updateVisualBaseline = process.env.UPDATE_EXPORT_VISUAL_BASELINE === '1';

function collectPageErrors(page: Page): PageErrorLog {
  const log: PageErrorLog = { consoleErrors: [], pageErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      log.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    log.pageErrors.push(error.message);
  });
  return log;
}

function expectNoPageErrors(log: PageErrorLog) {
  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
}

function hashBuffer(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function readPngSize(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function waitForVerticalSlice(page: Page): Promise<VerticalSliceSnapshot> {
  await page.waitForFunction(() => {
    const api = (window as ExportWindow).__WGM_VERTICAL_SLICE_TEST__;
    return api?.version === 1 && api.snapshot().phase === 'playing';
  });
  return page.evaluate(() => {
    const api = (window as ExportWindow).__WGM_VERTICAL_SLICE_TEST__;
    if (!api || api.version !== 1) {
      throw new Error('수직 절편 bridge를 찾을 수 없습니다.');
    }
    return api.snapshot();
  });
}

async function advanceTicks(page: Page, count: number): Promise<VerticalSliceSnapshot> {
  return page.evaluate(async (tickCount) => {
    const api = (window as ExportWindow).__WGM_VERTICAL_SLICE_TEST__;
    if (!api || api.version !== 1) {
      throw new Error('수직 절편 bridge를 찾을 수 없습니다.');
    }
    return api.advanceTicks(tickCount);
  }, count);
}

async function restartVerticalSlice(page: Page): Promise<VerticalSliceSnapshot> {
  return page.evaluate(async () => {
    const api = (window as ExportWindow).__WGM_VERTICAL_SLICE_TEST__;
    if (!api || api.version !== 1) {
      throw new Error('수직 절편 bridge를 찾을 수 없습니다.');
    }
    return api.restart();
  });
}

async function waitForCompat(page: Page): Promise<CompatibilitySnapshot> {
  await expect(page.getByTestId('compat-status')).toHaveAttribute('data-phase', 'ready');
  return page.evaluate(() => {
    const api = (window as ExportWindow).__WGM_PLAYER_TEST__;
    if (!api) {
      throw new Error('compat bridge를 찾을 수 없습니다.');
    }
    return api.snapshot();
  });
}

async function expectStudioReady(page: Page) {
  await expect(page.getByTestId('studio-preview-status')).toHaveAttribute(
    'data-ready',
    'true',
  );
}

async function expectSecurityHeader(page: Page, pathOrQuery: string) {
  const response = await page.goto(pathOrQuery);
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("'unsafe-eval'");
}

test.describe('Player static export', () => {
  test('Chromium에서 정적 export 전체 경로를 검증한다', async ({ page }) => {
    const errors = collectPageErrors(page);

    await expectSecurityHeader(page, './?e2e=1');
    const initial = await waitForVerticalSlice(page);
    await page.getByTestId('vertical-game-viewport').click();
    await page.keyboard.down('ArrowUp');
    const moved = await advanceTicks(page, 16);
    await page.keyboard.up('ArrowUp');
    expect(moved.player.y).toBeLessThan(initial.player.y);
    const restarted = await restartVerticalSlice(page);
    expect(restarted.run.runId).toBe(initial.run.runId + 1);
    expect(restarted.resources).toMatchObject({
      canvasCount: 1,
      orphanCanvases: 0,
      orphanListeners: 0,
      orphanTimers: 0,
    });

    await expectSecurityHeader(page, './?view=studio');
    await expect(page.getByTestId('studio-root')).toBeVisible();
    await expectStudioReady(page);
    await page.getByTestId('studio-hud-title-input').fill('Export Gate 07');
    await expect(page.getByTestId('studio-preview-status')).toHaveAttribute(
      'data-title',
      'Export Gate 07',
    );
    await page.getByTestId('studio-reset-preview').click();
    await expect(page.getByTestId('studio-cleanup-status')).toHaveAttribute(
      'data-reset-count',
      '1',
    );
    await expect(page.getByTestId('studio-cleanup-status')).toHaveAttribute('data-canvases', '0');
    await expectStudioReady(page);

    await expectSecurityHeader(page, './?view=compat');
    const compat = await waitForCompat(page);
    expect(compat.resources).toMatchObject({
      canvasCount: 1,
      orphanCanvases: 0,
      orphanListeners: 0,
      orphanTimers: 0,
    });
    const recreated = await page.evaluate(async () => {
      const api = (window as ExportWindow).__WGM_PLAYER_TEST__;
      if (!api) {
        throw new Error('compat bridge를 찾을 수 없습니다.');
      }
      return api.recreate(1);
    });
    expect(recreated.phase).toBe('ready');
    expect(recreated.resources.orphanCanvases).toBe(0);

    expectNoPageErrors(errors);
  });

  test('정적 export smoke @export-smoke', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('./?e2e=1');
    const game = await waitForVerticalSlice(page);
    expect(game.resources.canvasCount).toBe(1);
    const restarted = await restartVerticalSlice(page);
    expect(restarted.phase).toBe('playing');
    expect(restarted.resources.orphanCanvases).toBe(0);

    expectNoPageErrors(errors);
  });

  test('시각 기준선을 고정한다 @export-visual', async ({ page }) => {
    const samples: VisualBaseline['samples'] = {};
    const capture = async (name: string, pathOrQuery: string, ready: () => Promise<void>) => {
      await page.goto(pathOrQuery);
      await ready();
      const buffer = await page.screenshot({ animations: 'disabled', fullPage: false });
      const size = readPngSize(buffer);
      samples[name] = {
        path: pathOrQuery,
        width: size.width,
        height: size.height,
        sha256: hashBuffer(buffer),
      };
    };

    await capture('topdown-action', './?e2e=1', async () => {
      await waitForVerticalSlice(page);
      await advanceTicks(page, 4);
    });
    await capture('studio', './?view=studio', async () => {
      await expectStudioReady(page);
    });
    await capture('compat', './?view=compat', async () => {
      await waitForCompat(page);
    });

    const baseline: VisualBaseline = {
      schemaVersion: 1,
      generatedBy: 'tests/e2e/export-static.spec.ts',
      viewport: { width: 1280, height: 720 },
      samples,
    };

    if (updateVisualBaseline) {
      await mkdir(path.dirname(baselinePath), { recursive: true });
      await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
      return;
    }

    const expected = JSON.parse(await readFile(baselinePath, 'utf8')) as VisualBaseline;
    expect(baseline).toEqual(expected);
  });
});
