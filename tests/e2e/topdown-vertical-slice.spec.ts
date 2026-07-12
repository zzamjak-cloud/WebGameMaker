import { expect, test, type Page } from '@playwright/test';

type GamePhase = 'loading' | 'playing' | 'won' | 'lost' | 'destroyed' | 'error';
type EnemyMode = 'patrol' | 'chase' | 'dead';
type Facing = 'up' | 'down' | 'left' | 'right';

interface VerticalSliceSnapshot {
  schemaVersion: 1;
  projectId: string;
  sceneId: string;
  phase: GamePhase;
  errorMessage: string | null;
  tick: number;
  fixedDeltaMs: number;
  manualSimulation: boolean;
  assets: { png: boolean; svg: boolean };
  run: { runId: number; restartCount: number; elapsedMs: number };
  input: { focused: boolean; pressedKeys: string[] };
  player: {
    id: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    facing: Facing;
    health: number;
    maxHealth: number;
    invulnerable: boolean;
  };
  lamp: {
    heat: number;
    overheated: boolean;
    cooldownRemainingMs: number;
    range: number;
    halfAngleDegrees: number;
  };
  enemies: Array<{
    id: string;
    x: number;
    y: number;
    health: number;
    maxHealth: number;
    mode: EnemyMode;
    alive: boolean;
    patrolDirection: -1 | 1;
    chaseTransitions: number;
  }>;
  beacons: Array<{ id: string; x: number; y: number; lit: boolean }>;
  objective: {
    litBeacons: number;
    totalBeacons: number;
    remainingEnemies: number;
  };
  combat: {
    attackCount: number;
    attackHits: number;
    contactHits: number;
    lastTargetIds: string[];
  };
  resources: {
    canvasCount: number;
    listeners: number;
    timers: number;
    colliders: number;
    orphanCanvases: number;
    orphanListeners: number;
    orphanTimers: number;
  };
}

interface VerticalSliceTestApi {
  readonly version: 1;
  snapshot(): VerticalSliceSnapshot;
  advanceTicks(count: number): Promise<VerticalSliceSnapshot>;
  restart(): Promise<VerticalSliceSnapshot>;
}

type VerticalSliceWindow = Window & {
  __WGM_VERTICAL_SLICE_TEST__?: VerticalSliceTestApi;
};

interface PageErrorLog {
  consoleErrors: string[];
  pageErrors: string[];
}

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

async function readSnapshot(page: Page): Promise<VerticalSliceSnapshot> {
  return page.evaluate(() => {
    const api = (window as VerticalSliceWindow).__WGM_VERTICAL_SLICE_TEST__;
    if (!api || api.version !== 1) {
      throw new Error('수직 절편 test bridge v1을 찾을 수 없습니다.');
    }
    return api.snapshot();
  });
}

async function advanceTicks(
  page: Page,
  count: number,
): Promise<VerticalSliceSnapshot> {
  return page.evaluate(async (tickCount) => {
    const api = (window as VerticalSliceWindow).__WGM_VERTICAL_SLICE_TEST__;
    if (!api || api.version !== 1) {
      throw new Error('수직 절편 test bridge v1을 찾을 수 없습니다.');
    }
    return api.advanceTicks(tickCount);
  }, count);
}

async function advanceUntil(
  page: Page,
  label: string,
  predicate: (snapshot: VerticalSliceSnapshot) => boolean,
  options: { maxTicks: number; step?: number },
): Promise<VerticalSliceSnapshot> {
  const step = options.step ?? 1;
  let advancedTicks = 0;
  let lastSnapshot = await readSnapshot(page);

  while (!predicate(lastSnapshot) && advancedTicks < options.maxTicks) {
    const nextCount = Math.min(step, options.maxTicks - advancedTicks);
    lastSnapshot = await advanceTicks(page, nextCount);
    advancedTicks += nextCount;
  }

  if (!predicate(lastSnapshot)) {
    throw new Error(
      `${label}: ${options.maxTicks} tick 안에 조건을 만족하지 못했습니다.\n` +
        `마지막 snapshot: ${JSON.stringify(lastSnapshot, null, 2)}`,
    );
  }
  return lastSnapshot;
}

async function openVerticalSlice(page: Page): Promise<VerticalSliceSnapshot> {
  await page.goto('./?e2e=1');
  expect(new URL(page.url()).pathname).toBe('/phase-0/nested/');
  await page.waitForFunction(
    () =>
      (window as VerticalSliceWindow).__WGM_VERTICAL_SLICE_TEST__?.version === 1 &&
      (window as VerticalSliceWindow).__WGM_VERTICAL_SLICE_TEST__?.snapshot().phase ===
        'playing',
  );
  return readSnapshot(page);
}

async function expectHudMatches(
  page: Page,
  snapshot: VerticalSliceSnapshot,
): Promise<void> {
  const status = page.getByTestId('vertical-slice-status');
  await expect(status).toHaveAttribute('data-phase', snapshot.phase);
  await expect(status).toHaveAttribute('data-health', String(snapshot.player.health));
  await expect(status).toHaveAttribute(
    'data-lit-beacons',
    String(snapshot.objective.litBeacons),
  );
  await expect(status).toHaveAttribute(
    'data-remaining-enemies',
    String(snapshot.objective.remainingEnemies),
  );
  await expect(page.getByTestId('hud-health')).toHaveText(
    `${snapshot.player.health}/${snapshot.player.maxHealth}`,
  );
  await expect(page.getByTestId('hud-beacons')).toHaveAttribute(
    'aria-label',
    `신호등 ${snapshot.objective.litBeacons}/${snapshot.objective.totalBeacons}`,
  );
  await expect(page.getByTestId('hud-heat')).toHaveText(
    `${Math.round(snapshot.lamp.heat)}%`,
  );
  await expect(page.getByTestId('hud-enemies')).toHaveText(
    String(snapshot.objective.remainingEnemies),
  );
}

function expectInitialRun(
  snapshot: VerticalSliceSnapshot,
  runId: number,
  resourceBaseline: VerticalSliceSnapshot['resources'],
): void {
  expect(snapshot).toMatchObject({
    projectId: 'game.floodgate-07',
    sceneId: 'scene.floodgate-07-main',
    phase: 'playing',
    tick: 0,
    manualSimulation: true,
    assets: { png: true, svg: true },
    run: { runId, restartCount: runId - 1, elapsedMs: 0 },
    input: { focused: runId > 1, pressedKeys: [] },
    player: {
      x: 640,
      y: 560,
      velocityX: 0,
      velocityY: 0,
      facing: 'up',
      health: 100,
      maxHealth: 100,
      invulnerable: false,
    },
    lamp: { heat: 0, overheated: false, cooldownRemainingMs: 0 },
    objective: { litBeacons: 0, totalBeacons: 3, remainingEnemies: 3 },
    combat: { attackCount: 0, attackHits: 0, contactHits: 0, lastTargetIds: [] },
    resources: resourceBaseline,
  });
  expect(snapshot.enemies).toHaveLength(3);
  expect(
    snapshot.enemies.every(
      (enemy) =>
        enemy.alive &&
        enemy.mode === 'patrol' &&
        enemy.health === enemy.maxHealth &&
        enemy.chaseTransitions === 0,
    ),
  ).toBe(true);
  expect(snapshot.beacons.every((beacon) => !beacon.lit)).toBe(true);
}

function directionKeyForVector(
  horizontal: number,
  vertical: number,
  useSecondaryAxis: boolean,
): 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' {
  const horizontalDominant = Math.abs(horizontal) >= Math.abs(vertical);
  const useHorizontal = useSecondaryAxis ? !horizontalDominant : horizontalDominant;
  if (useHorizontal) {
    return horizontal < 0 ? 'ArrowLeft' : 'ArrowRight';
  }
  return vertical < 0 ? 'ArrowUp' : 'ArrowDown';
}

function facingDotForCardinal(horizontal: number, vertical: number): number {
  const distance = Math.hypot(horizontal, vertical);
  if (distance === 0) {
    return 1;
  }
  return Math.max(Math.abs(horizontal), Math.abs(vertical)) / distance;
}

async function holdKeyForTicks(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  ticks: number,
): Promise<VerticalSliceSnapshot> {
  await page.keyboard.down(key);
  try {
    return await advanceTicks(page, ticks);
  } finally {
    await releaseKeyIfPageOpen(page, key);
  }
}

async function releaseKeyIfPageOpen(page: Page, key: string): Promise<void> {
  if (page.isClosed()) {
    return;
  }
  try {
    await page.keyboard.up(key);
  } catch (error) {
    if (!page.isClosed()) {
      throw error;
    }
  }
}

async function focusCanvas(page: Page): Promise<void> {
  const canvas = page.getByTestId('vertical-slice-canvas');
  await canvas.click();
  await expect(canvas).toBeFocused();
  expect((await readSnapshot(page)).input.focused).toBe(true);
}

async function defeatNearestEnemy(page: Page): Promise<VerticalSliceSnapshot> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const snapshot = await readSnapshot(page);
    if (snapshot.phase !== 'playing') {
      throw new Error(`적 처치 전에 게임이 종료됐습니다: ${JSON.stringify(snapshot)}`);
    }
    const livingEnemies = snapshot.enemies
      .filter((enemy) => enemy.alive)
      .sort(
        (left, right) =>
          Math.hypot(left.x - snapshot.player.x, left.y - snapshot.player.y) -
          Math.hypot(right.x - snapshot.player.x, right.y - snapshot.player.y),
      );
    const target = livingEnemies[0];
    if (!target) {
      return snapshot;
    }

    const horizontal = target.x - snapshot.player.x;
    const vertical = target.y - snapshot.player.y;
    const distance = Math.hypot(horizontal, vertical);
    const minimumDot = Math.cos(
      ((snapshot.lamp.halfAngleDegrees - 2) * Math.PI) / 180,
    );
    const aligned = facingDotForCardinal(horizontal, vertical) >= minimumDot;

    if (distance <= snapshot.lamp.range - 16 && aligned) {
      const facingKey = directionKeyForVector(horizontal, vertical, false);
      await holdKeyForTicks(page, facingKey, 1);
      const beforeAttack = await readSnapshot(page);
      const beforeTarget = beforeAttack.enemies.find(
        (enemy) => enemy.id === target.id,
      );
      await page.keyboard.press('Space');
      const afterAttack = await advanceTicks(page, 1);
      const afterTarget = afterAttack.enemies.find((enemy) => enemy.id === target.id);
      if (
        beforeTarget &&
        afterTarget &&
        afterTarget.health < beforeTarget.health &&
        afterAttack.combat.lastTargetIds.includes(target.id)
      ) {
        return afterAttack;
      }
      throw new Error(
        `실제 Space 공격이 예상한 적에게 적중하지 않았습니다.\n` +
          `공격 전: ${JSON.stringify(beforeAttack, null, 2)}\n` +
          `공격 후: ${JSON.stringify(afterAttack, null, 2)}`,
      );
    }

    const movementKey = directionKeyForVector(
      horizontal,
      vertical,
      distance <= snapshot.lamp.range - 16 && !aligned,
    );
    await holdKeyForTicks(page, movementKey, 2);
  }

  throw new Error(`180회 이동 안에 적에게 접근하지 못했습니다: ${JSON.stringify(await readSnapshot(page), null, 2)}`);
}

async function completeVictory(page: Page): Promise<VerticalSliceSnapshot> {
  await focusCanvas(page);

  for (let defeated = 0; defeated < 3; defeated += 1) {
    const snapshot = await defeatNearestEnemy(page);
    expect(snapshot.combat.attackHits).toBeGreaterThanOrEqual(defeated + 1);
  }

  const won = await advanceUntil(
    page,
    '세 적 제거 후 승리',
    (snapshot) => snapshot.phase === 'won',
    { maxTicks: 2 },
  );
  expect(won.objective).toEqual({
    litBeacons: 3,
    totalBeacons: 3,
    remainingEnemies: 0,
  });
  expect(won.enemies.every((enemy) => enemy.mode === 'dead' && !enemy.alive)).toBe(
    true,
  );
  return won;
}

test.describe('수문 07 런타임 수직 절편 @vertical-slice', () => {
  test.beforeEach(async ({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      `${testInfo.project.name}은 Phase 1 Chromium 완료 게이트 범위 밖입니다.`,
    );
  });

  test('이동·추적·조사광 승리와 실제 재시작 3회를 검증한다', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectPageErrors(page);
    const initial = await openVerticalSlice(page);
    const gameHost = page.getByTestId('vertical-game-host');

    await expect(gameHost.locator('canvas')).toHaveCount(1);
    expect(initial.resources).toMatchObject({
      canvasCount: 1,
      colliders: 3,
      orphanCanvases: 0,
      orphanListeners: 0,
      orphanTimers: 0,
    });
    const resourceBaseline = { ...initial.resources };
    expectInitialRun(initial, 1, resourceBaseline);
    await expectHudMatches(page, initial);

    const patrolStart = initial.enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
    }));
    const patrol = await advanceTicks(page, 10);
    expect(
      patrol.enemies.some((enemy, index) => {
        const before = patrolStart[index];
        return before && (enemy.x !== before.x || enemy.y !== before.y);
      }),
    ).toBe(true);

    await focusCanvas(page);
    const movementStart = await readSnapshot(page);
    await page.keyboard.down('ArrowUp');
    let chasing: VerticalSliceSnapshot;
    try {
      chasing = await advanceUntil(
        page,
        '실제 이동 후 patrol → chase',
        (snapshot) =>
          snapshot.enemies.some(
            (enemy) => enemy.mode === 'chase' && enemy.chaseTransitions > 0,
          ),
        { maxTicks: 80, step: 2 },
      );
    } finally {
      await releaseKeyIfPageOpen(page, 'ArrowUp');
    }
    expect(chasing.player.y).toBeLessThan(movementStart.player.y);
    expect(chasing.input.focused).toBe(true);

    const won = await completeVictory(page);
    await expectHudMatches(page, won);
    await expect(page.getByTestId('result-dialog')).toHaveAttribute(
      'data-result',
      'won',
    );
    await expect(page.getByRole('heading', { name: '수문 07 재점화' })).toBeVisible();

    for (let restartIndex = 1; restartIndex <= 3; restartIndex += 1) {
      const restartButton = page.getByTestId('restart-button');
      await expect(restartButton).toBeVisible();
      await restartButton.click();
      await page.waitForFunction(
        (runId) => {
          const snapshot = (window as VerticalSliceWindow).__WGM_VERTICAL_SLICE_TEST__?.snapshot();
          return snapshot?.phase === 'playing' && snapshot.run.runId === runId;
        },
        restartIndex + 1,
      );
      const restarted = await readSnapshot(page);
      expectInitialRun(restarted, restartIndex + 1, resourceBaseline);
      await expect(gameHost.locator('canvas')).toHaveCount(1);
      await expect(page.getByTestId('result-dialog')).toHaveCount(0);
      await expectHudMatches(page, restarted);

      if (restartIndex < 3) {
        await completeVictory(page);
        await expect(page.getByTestId('result-dialog')).toHaveAttribute(
          'data-result',
          'won',
        );
      }
    }

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('실제 접촉 피해로 패배하고 종료 입력 차단과 재시작을 검증한다', async ({ page }) => {
    const errors = collectPageErrors(page);
    const initial = await openVerticalSlice(page);
    const canvas = page.getByTestId('vertical-slice-canvas');
    const resourceBaseline = { ...initial.resources };

    await focusCanvas(page);
    const moved = await holdKeyForTicks(page, 'ArrowUp', 25);
    expect(moved.player.y).toBeLessThan(initial.player.y);
    expect(moved.enemies.some((enemy) => enemy.mode === 'chase')).toBe(true);

    const lost = await advanceUntil(
      page,
      '적 접촉 피해 누적으로 패배',
      (snapshot) => snapshot.phase === 'lost',
      { maxTicks: 600, step: 5 },
    );
    expect(lost.player.health).toBe(0);
    expect(lost.combat.contactHits).toBeGreaterThanOrEqual(5);
    await expectHudMatches(page, lost);
    await expect(page.getByTestId('result-dialog')).toHaveAttribute(
      'data-result',
      'lost',
    );
    await expect(page.getByRole('heading', { name: '등불이 꺼졌습니다' })).toBeVisible();

    await canvas.focus();
    const endedGameplay = {
      phase: lost.phase,
      player: lost.player,
      enemies: lost.enemies,
      objective: lost.objective,
      combat: lost.combat,
    };
    await page.keyboard.down('ArrowRight');
    try {
      await page.keyboard.press('Space');
      const afterEndInput = await advanceTicks(page, 30);
      expect({
        phase: afterEndInput.phase,
        player: afterEndInput.player,
        enemies: afterEndInput.enemies,
        objective: afterEndInput.objective,
        combat: afterEndInput.combat,
      }).toEqual(endedGameplay);
      expect(afterEndInput.input.pressedKeys).toEqual([]);
    } finally {
      await releaseKeyIfPageOpen(page, 'ArrowRight');
    }

    await page.getByTestId('restart-button').click();
    await page.waitForFunction(
      () => {
        const snapshot = (window as VerticalSliceWindow).__WGM_VERTICAL_SLICE_TEST__?.snapshot();
        return snapshot?.phase === 'playing' && snapshot.run.runId === 2;
      },
    );
    const restarted = await readSnapshot(page);
    expectInitialRun(restarted, 2, resourceBaseline);
    await expect(page.getByTestId('vertical-game-host').locator('canvas')).toHaveCount(1);
    await expectHudMatches(page, restarted);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
