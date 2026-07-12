import {
  advanceElapsedMs,
  applyContactDamage,
  applySearchlightPulse,
  compileProject,
  coolSearchlight,
  createInitialGameState,
  findSearchlightTargets,
  integratePlayerPosition,
  replaceEnemyState,
  resolvePlayerMovement,
  restartGameState,
  stepEnemyAi,
  updatePlayerPose,
  type EnemyConfig,
  type Facing,
  type FloodgateProjectConfig,
  type GameState,
  type Position,
} from '@web-game-maker/floodgate-07';
import Phaser from 'phaser';

import projectJson from '../../../../games/floodgate-07/game.project.json';
import sceneJson from '../../../../games/floodgate-07/scenes/main.scene.json';
import {
  destroyPhaserGame,
  PhaserGlobalDomResources,
  RuntimeResourceLedger,
  RuntimeResourceMonitor,
} from '../game/phaserLifecycle';
import type {
  VerticalSliceController,
  VerticalSliceResourceSnapshot,
  VerticalSliceSnapshot,
  VerticalSliceSnapshotListener,
} from './verticalSliceTypes';

const FIXED_DELTA_MS = 1_000 / 60;
const MAX_ACCUMULATED_TICKS = 15;
const PLAYER_TEXTURE = 'floodgate-player-svg';
const ENEMY_TEXTURE = 'floodgate-enemy-svg';
const PIXEL_TEXTURE = 'floodgate-pixel-png';
const PLAYER_RADIUS = 25;
const ENEMY_RADIUS = 23;
const ATTACK_VISUAL_TICKS = 7;

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZhZQAAAAASUVORK5CYII=';

const PLAYER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <path d="M32 4 58 48 32 60 6 48Z" fill="#F4D06F" stroke="#102A43" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="32" cy="35" r="10" fill="#E9F5FF" stroke="#102A43" stroke-width="3"/>
    <path d="M32 8 40 24 32 20 24 24Z" fill="#FF6B4A"/>
  </svg>
`;

const ENEMY_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <path d="M10 15C20 4 44 4 54 15L58 48C49 58 15 58 6 48Z" fill="#17233A" stroke="#7FE7D7" stroke-width="4"/>
    <circle cx="23" cy="30" r="5" fill="#FF7657"/>
    <circle cx="41" cy="30" r="5" fill="#FF7657"/>
    <path d="M19 44C26 38 38 38 45 44" fill="none" stroke="#7FE7D7" stroke-width="3" stroke-linecap="round"/>
  </svg>
`;

const COMPILED_PROJECT = compileProject({
  project: projectJson,
  scenes: [sceneJson],
});

type DirectionCode =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'KeyW'
  | 'KeyA'
  | 'KeyS'
  | 'KeyD';

interface SceneAssets {
  png: boolean;
  svg: boolean;
}

interface EnemyVisual {
  config: EnemyConfig;
  sprite: Phaser.Physics.Arcade.Sprite;
  collider: Phaser.Physics.Arcade.Collider;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isManualSimulation(): boolean {
  return (
    window.top === window &&
    new URLSearchParams(window.location.search).get('e2e') === '1'
  );
}

function svgDataUri(source: string): string {
  return `data:image/svg+xml;base64,${window.btoa(source)}`;
}

function facingVector(facing: Facing): Position {
  switch (facing) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

function freezeSnapshot(snapshot: VerticalSliceSnapshot): VerticalSliceSnapshot {
  Object.freeze(snapshot.assets);
  Object.freeze(snapshot.run);
  Object.freeze(snapshot.input.pressedKeys);
  Object.freeze(snapshot.input);
  Object.freeze(snapshot.player);
  Object.freeze(snapshot.lamp);
  for (const enemy of snapshot.enemies) {
    Object.freeze(enemy);
  }
  Object.freeze(snapshot.enemies);
  for (const beacon of snapshot.beacons) {
    Object.freeze(beacon);
  }
  Object.freeze(snapshot.beacons);
  Object.freeze(snapshot.objective);
  Object.freeze(snapshot.combat.lastTargetIds);
  Object.freeze(snapshot.combat);
  Object.freeze(snapshot.resources);
  return Object.freeze(snapshot);
}

function createInitialSnapshot(
  config: FloodgateProjectConfig,
  manualSimulation: boolean,
): VerticalSliceSnapshot {
  const state = createInitialGameState(config);
  return freezeSnapshot({
    schemaVersion: 1,
    projectId: config.projectId,
    sceneId: config.sceneId,
    phase: 'loading',
    errorMessage: null,
    tick: 0,
    fixedDeltaMs: FIXED_DELTA_MS,
    manualSimulation,
    assets: { png: false, svg: false },
    run: {
      runId: state.run.runId,
      restartCount: 0,
      elapsedMs: state.run.elapsedMs,
    },
    input: { focused: false, pressedKeys: [] },
    player: {
      id: state.player.id,
      x: state.player.position.x,
      y: state.player.position.y,
      velocityX: 0,
      velocityY: 0,
      facing: state.player.facing,
      health: state.player.health,
      maxHealth: state.player.maxHealth,
      invulnerable: false,
    },
    lamp: {
      heat: state.lamp.heat,
      overheated: state.lamp.overheated,
      cooldownRemainingMs: 0,
      range: config.player.searchlight.range,
      halfAngleDegrees: config.player.searchlight.halfAngleDegrees,
    },
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.position.x,
      y: enemy.position.y,
      health: enemy.health,
      maxHealth: enemy.maxHealth,
      mode: enemy.mode,
      alive: true,
      patrolDirection: enemy.patrolDirection,
      chaseTransitions: 0,
    })),
    beacons: config.beacons.map((beacon) => ({
      id: beacon.id,
      x: beacon.position.x,
      y: beacon.position.y,
      lit: false,
    })),
    objective: {
      litBeacons: 0,
      totalBeacons: config.beacons.length,
      remainingEnemies: config.enemies.length,
    },
    combat: {
      attackCount: 0,
      attackHits: 0,
      contactHits: 0,
      lastTargetIds: [],
    },
    resources: {
      canvasCount: 0,
      listeners: 0,
      timers: 0,
      colliders: 0,
      orphanCanvases: 0,
      orphanListeners: 0,
      orphanTimers: 0,
    },
  });
}

class FloodgateScene extends Phaser.Scene {
  private accumulatorMs = 0;
  private assets: SceneAssets = { png: false, svg: false };
  private attackCount = 0;
  private attackHits = 0;
  private attackQueued = false;
  private attackVisualTicks = 0;
  private beacons: Phaser.GameObjects.Image[] = [];
  private canvasListenerDisposers = new Set<() => void>();
  private chaseTransitions = new Map<string, number>();
  private contactHits = 0;
  private enemyVisuals = new Map<string, EnemyVisual>();
  private focused = false;
  private gameState: GameState;
  private inputEnabled = true;
  private lastTargetIds: readonly string[] = [];
  private lastVelocity: Position = { x: 0, y: 0 };
  private loadFailed = false;
  private playerSprite: Phaser.Physics.Arcade.Sprite | null = null;
  private pressedKeys = new Set<string>();
  private searchlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private tick = 0;

  constructor(
    private readonly config: FloodgateProjectConfig,
    private readonly manualSimulation: boolean,
    private readonly resources: RuntimeResourceLedger,
    private readonly onReady: () => void,
    private readonly onChanged: () => void,
  ) {
    super({ key: config.sceneId });
    this.gameState = createInitialGameState(config);
  }

  preload(): void {
    this.load.once('loaderror', () => {
      this.loadFailed = true;
    });
    this.load.image(PIXEL_TEXTURE, PNG_DATA_URI);
    this.load.svg(PLAYER_TEXTURE, svgDataUri(PLAYER_SVG), { width: 64, height: 64 });
    this.load.svg(ENEMY_TEXTURE, svgDataUri(ENEMY_SVG), { width: 64, height: 64 });
  }

  create(): void {
    this.physics.world.setBounds(0, 0, this.config.viewport.width, this.config.viewport.height);
    this.createDeck();
    this.createBeacons();
    this.createActors();
    this.searchlightGraphics = this.add.graphics().setDepth(4);
    this.bindCanvasInput();
    this.resources.listen('blur', () => this.clearInput(true));

    this.assets = {
      png: !this.loadFailed && this.textures.exists(PIXEL_TEXTURE),
      svg:
        !this.loadFailed &&
        this.textures.exists(PLAYER_TEXTURE) &&
        this.textures.exists(ENEMY_TEXTURE),
    };
    this.syncVisuals();
    this.onReady();
  }

  update(_time: number, delta: number): void {
    if (this.manualSimulation || !Number.isFinite(delta) || delta <= 0) {
      return;
    }

    this.accumulatorMs = Math.min(
      this.accumulatorMs + delta,
      FIXED_DELTA_MS * MAX_ACCUMULATED_TICKS,
    );
    while (this.accumulatorMs >= FIXED_DELTA_MS) {
      this.simulateTick(false);
      this.accumulatorMs -= FIXED_DELTA_MS;
    }
    this.onChanged();
  }

  advanceFixedTicks(count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.simulateTick(false);
    }
    this.onChanged();
  }

  restartRun(): void {
    this.gameState = restartGameState(this.config, this.gameState);
    this.tick = 0;
    this.accumulatorMs = 0;
    this.attackCount = 0;
    this.attackHits = 0;
    this.contactHits = 0;
    this.lastTargetIds = [];
    this.chaseTransitions.clear();
    this.attackVisualTicks = 0;
    this.searchlightGraphics?.clear();
    this.game.canvas.blur();
    this.clearInput(false);
    this.inputEnabled = true;
    this.syncVisuals();
    this.onChanged();
  }

  disposeOwnedResources(): void {
    this.clearInput(false);
    for (const dispose of this.canvasListenerDisposers) {
      dispose();
    }
    this.canvasListenerDisposers.clear();
    for (const visual of this.enemyVisuals.values()) {
      visual.collider.destroy();
    }
    this.enemyVisuals.clear();
  }

  getInputListenerCount(): number {
    return this.canvasListenerDisposers.size;
  }

  getColliderCount(): number {
    return this.enemyVisuals.size;
  }

  getSnapshot(resources: VerticalSliceResourceSnapshot): VerticalSliceSnapshot {
    const nowMs = this.gameState.run.elapsedMs;
    const phase = this.loadFailed ? 'error' : this.gameState.phase;
    return freezeSnapshot({
      schemaVersion: 1,
      projectId: this.config.projectId,
      sceneId: this.config.sceneId,
      phase,
      errorMessage: this.loadFailed ? '수직 절편 자산을 불러오지 못했습니다.' : null,
      tick: this.tick,
      fixedDeltaMs: FIXED_DELTA_MS,
      manualSimulation: this.manualSimulation,
      assets: { ...this.assets },
      run: {
        runId: this.gameState.run.runId,
        restartCount: this.gameState.run.runId - 1,
        elapsedMs: nowMs,
      },
      input: {
        focused: this.focused,
        pressedKeys: [...this.pressedKeys].sort(compareCodeUnits),
      },
      player: {
        id: this.gameState.player.id,
        x: this.gameState.player.position.x,
        y: this.gameState.player.position.y,
        velocityX: this.lastVelocity.x,
        velocityY: this.lastVelocity.y,
        facing: this.gameState.player.facing,
        health: this.gameState.player.health,
        maxHealth: this.gameState.player.maxHealth,
        invulnerable: nowMs < this.gameState.player.invulnerableUntil,
      },
      lamp: {
        heat: this.gameState.lamp.heat,
        overheated: this.gameState.lamp.overheated,
        cooldownRemainingMs: Math.max(0, this.gameState.lamp.overheatedUntil - nowMs),
        range: this.config.player.searchlight.range,
        halfAngleDegrees: this.config.player.searchlight.halfAngleDegrees,
      },
      enemies: this.gameState.enemies.map((enemy) => ({
        id: enemy.id,
        x: enemy.position.x,
        y: enemy.position.y,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        mode: enemy.mode,
        alive: enemy.mode !== 'dead',
        patrolDirection: enemy.patrolDirection,
        chaseTransitions: this.chaseTransitions.get(enemy.id) ?? 0,
      })),
      beacons: this.config.beacons.map((beacon, index) => ({
        id: beacon.id,
        x: beacon.position.x,
        y: beacon.position.y,
        lit: index < this.gameState.objective.litBeacons,
      })),
      objective: {
        litBeacons: this.gameState.objective.litBeacons,
        totalBeacons: this.gameState.objective.totalBeacons,
        remainingEnemies: this.gameState.enemies.filter((enemy) => enemy.mode !== 'dead').length,
      },
      combat: {
        attackCount: this.attackCount,
        attackHits: this.attackHits,
        contactHits: this.contactHits,
        lastTargetIds: [...this.lastTargetIds],
      },
      resources,
    });
  }

  private createDeck(): void {
    const { width, height } = this.config.viewport;
    this.add.rectangle(width / 2, height / 2, width, height, 0x071a2a);
    this.add.grid(
      width / 2,
      height / 2,
      width,
      height,
      80,
      80,
      0x0d2837,
      0.72,
      0x1a4a5e,
      0.34,
    );
    this.add.rectangle(width / 2, 76, width - 96, 8, 0x31697d).setAlpha(0.85);
    this.add.rectangle(width / 2, height - 54, width - 96, 6, 0x31697d).setAlpha(0.45);

    for (let index = 0; index < 6; index += 1) {
      this.add
        .circle(90 + index * 220, height / 2, 7, 0x7fe7d7)
        .setAlpha(index % 2 === 0 ? 0.45 : 0.2);
    }
  }

  private createBeacons(): void {
    this.beacons = this.config.beacons.map((beacon) =>
      this.add
        .image(beacon.position.x, beacon.position.y, PIXEL_TEXTURE)
        .setDisplaySize(82, 18)
        .setTint(0x284c5d)
        .setDepth(2),
    );
  }

  private createActors(): void {
    const player = this.physics.add
      .sprite(this.gameState.player.position.x, this.gameState.player.position.y, PLAYER_TEXTURE)
      .setDisplaySize(58, 58)
      .setCircle(PLAYER_RADIUS)
      .setCollideWorldBounds(true)
      .setDepth(6);
    player.body?.setAllowGravity(false);
    this.playerSprite = player;

    for (const enemyConfig of this.config.enemies) {
      const enemy = this.gameState.enemies.find((candidate) => candidate.id === enemyConfig.id);
      if (!enemy) {
        throw new Error(`적 초기 상태를 찾을 수 없습니다: ${enemyConfig.id}`);
      }
      const sprite = this.physics.add
        .sprite(enemy.position.x, enemy.position.y, ENEMY_TEXTURE)
        .setDisplaySize(54, 54)
        .setCircle(ENEMY_RADIUS)
        .setDepth(5);
      sprite.body?.setAllowGravity(false);
      const collider = this.physics.add.overlap(player, sprite);
      this.enemyVisuals.set(enemy.id, { config: enemyConfig, sprite, collider });
      this.chaseTransitions.set(enemy.id, 0);
    }
  }

  private bindCanvasInput(): void {
    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '수문 07 탑다운 액션 게임');
    canvas.setAttribute('aria-describedby', 'slice-controls');
    canvas.dataset.testid = 'vertical-slice-canvas';

    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      listener: (event: HTMLElementEventMap[K]) => void,
    ) => {
      const eventListener = listener as EventListener;
      canvas.addEventListener(type, eventListener);
      this.canvasListenerDisposers.add(() => canvas.removeEventListener(type, eventListener));
    };

    listen('pointerdown', () => canvas.focus());
    listen('focus', () => {
      this.focused = true;
      this.onChanged();
    });
    listen('blur', () => this.clearInput(true));
    listen('keydown', (event) => this.handleKeyDown(event));
    listen('keyup', (event) => this.handleKeyUp(event));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isGameKey(event.code)) {
      return;
    }
    event.preventDefault();
    if (!this.inputEnabled || this.gameState.phase !== 'playing') {
      this.clearInput(false);
      return;
    }

    const wasPressed = this.pressedKeys.has(event.code);
    this.pressedKeys.add(event.code);
    if (event.code === 'Space' && !wasPressed && !event.repeat) {
      this.attackQueued = true;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.isGameKey(event.code)) {
      return;
    }
    event.preventDefault();
    this.pressedKeys.delete(event.code);
  }

  private isGameKey(code: string): code is DirectionCode | 'Space' {
    return (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'Space'
    );
  }

  private clearInput(publish: boolean): void {
    this.pressedKeys.clear();
    this.attackQueued = false;
    this.focused = false;
    this.lastVelocity = { x: 0, y: 0 };
    this.playerSprite?.setVelocity(0, 0);
    if (publish) {
      this.onChanged();
    }
  }

  private movementInput() {
    return {
      up: this.pressedKeys.has('ArrowUp') || this.pressedKeys.has('KeyW'),
      down: this.pressedKeys.has('ArrowDown') || this.pressedKeys.has('KeyS'),
      left: this.pressedKeys.has('ArrowLeft') || this.pressedKeys.has('KeyA'),
      right: this.pressedKeys.has('ArrowRight') || this.pressedKeys.has('KeyD'),
    };
  }

  private simulateTick(publish: boolean): void {
    this.tick += 1;
    if (this.gameState.phase !== 'playing') {
      this.inputEnabled = false;
      this.clearInput(false);
      if (publish) {
        this.onChanged();
      }
      return;
    }

    let nextState = advanceElapsedMs(this.gameState, FIXED_DELTA_MS);
    const movement = resolvePlayerMovement(
      this.movementInput(),
      this.config.player.speed,
      nextState.player.facing,
    );
    const playerPosition = integratePlayerPosition(
      nextState.player.position,
      movement.velocity,
      FIXED_DELTA_MS,
      {
        width: this.config.viewport.width,
        height: this.config.viewport.height,
        padding: PLAYER_RADIUS + 8,
      },
    );
    this.lastVelocity = movement.velocity;
    nextState = updatePlayerPose(nextState, playerPosition, movement.facing);

    for (const enemyConfig of this.config.enemies) {
      const enemy = nextState.enemies.find((candidate) => candidate.id === enemyConfig.id);
      if (!enemy) {
        continue;
      }
      const advancedEnemy = stepEnemyAi(
        enemy,
        nextState.player.position,
        enemyConfig,
        FIXED_DELTA_MS,
      );
      if (enemy.mode !== advancedEnemy.mode && advancedEnemy.mode !== 'dead') {
        this.chaseTransitions.set(
          enemy.id,
          (this.chaseTransitions.get(enemy.id) ?? 0) + 1,
        );
      }
      nextState = replaceEnemyState(nextState, advancedEnemy);
    }

    nextState = coolSearchlight(
      nextState,
      this.config.player.searchlight,
      FIXED_DELTA_MS,
      nextState.run.elapsedMs,
    );
    this.gameState = nextState;
    this.syncActorBodies();

    if (this.attackQueued) {
      this.attackQueued = false;
      if (!this.gameState.lamp.overheated) {
        const targets = findSearchlightTargets(
          this.gameState,
          this.config.player.searchlight,
        );
        const healthBefore = new Map(
          this.gameState.enemies.map((enemy) => [enemy.id, enemy.health] as const),
        );
        this.gameState = applySearchlightPulse(
          this.gameState,
          targets,
          this.config.player.searchlight,
          this.gameState.run.elapsedMs,
        );
        this.attackCount += 1;
        this.attackHits += this.gameState.enemies.filter(
          (enemy) => enemy.health < (healthBefore.get(enemy.id) ?? enemy.health),
        ).length;
        this.lastTargetIds = targets;
        this.attackVisualTicks = ATTACK_VISUAL_TICKS;
      }
    }

    this.applyArcadeContactDamage();
    if (this.gameState.phase !== 'playing') {
      this.inputEnabled = false;
      this.game.canvas.blur();
      this.clearInput(false);
    }
    this.syncVisuals();

    if (this.attackVisualTicks > 0) {
      this.attackVisualTicks -= 1;
    }
    this.drawSearchlight();
    if (publish) {
      this.onChanged();
    }
  }

  private applyArcadeContactDamage(): void {
    const player = this.playerSprite;
    if (!player || this.gameState.phase !== 'playing') {
      return;
    }

    for (const enemyState of this.gameState.enemies) {
      if (enemyState.mode === 'dead') {
        continue;
      }
      const visual = this.enemyVisuals.get(enemyState.id);
      if (!visual || !this.physics.overlap(player, visual.sprite)) {
        continue;
      }
      const healthBefore = this.gameState.player.health;
      this.gameState = applyContactDamage(this.gameState, {
        damage: visual.config.contact.damage,
        nowMs: this.gameState.run.elapsedMs,
        invulnerabilityMs: visual.config.contact.cooldownMs,
      });
      if (this.gameState.player.health < healthBefore) {
        this.contactHits += 1;
      }
    }
  }

  private syncActorBodies(): void {
    const player = this.playerSprite;
    if (player) {
      player.setPosition(this.gameState.player.position.x, this.gameState.player.position.y);
      if (player.body instanceof Phaser.Physics.Arcade.Body) {
        player.body.reset(this.gameState.player.position.x, this.gameState.player.position.y);
        // 수동 tick 사이의 Phaser RAF가 상태를 몰래 전진시키지 않도록 E2E에서는 body 속도를 잠근다.
        player.body.setVelocity(
          this.manualSimulation ? 0 : this.lastVelocity.x,
          this.manualSimulation ? 0 : this.lastVelocity.y,
        );
      }
    }

    for (const enemy of this.gameState.enemies) {
      const visual = this.enemyVisuals.get(enemy.id);
      if (!visual) {
        continue;
      }
      visual.sprite.setPosition(enemy.position.x, enemy.position.y);
      if (visual.sprite.body instanceof Phaser.Physics.Arcade.Body) {
        visual.sprite.body.reset(enemy.position.x, enemy.position.y);
      }
    }
  }

  private syncVisuals(): void {
    this.syncActorBodies();
    const nowMs = this.gameState.run.elapsedMs;
    this.playerSprite?.setTint(
      nowMs < this.gameState.player.invulnerableUntil ? 0xff7657 : 0xffffff,
    );

    for (const enemy of this.gameState.enemies) {
      const visual = this.enemyVisuals.get(enemy.id);
      if (!visual) {
        continue;
      }
      const alive = enemy.mode !== 'dead';
      visual.sprite.setActive(alive).setVisible(alive);
      if (visual.sprite.body instanceof Phaser.Physics.Arcade.Body) {
        visual.sprite.body.enable = alive;
      }
      visual.sprite.setTint(enemy.mode === 'chase' ? 0xff7657 : 0xffffff);
    }

    this.beacons.forEach((beacon, index) => {
      beacon
        .setTint(index < this.gameState.objective.litBeacons ? 0xf4d06f : 0x284c5d)
        .setAlpha(index < this.gameState.objective.litBeacons ? 1 : 0.58);
    });
  }

  private drawSearchlight(): void {
    const graphics = this.searchlightGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    if (this.attackVisualTicks <= 0) {
      return;
    }

    const origin = this.gameState.player.position;
    const facing = facingVector(this.gameState.player.facing);
    const angle = Math.atan2(facing.y, facing.x);
    const halfAngle = (this.config.player.searchlight.halfAngleDegrees * Math.PI) / 180;
    const range = this.config.player.searchlight.range;
    const left = {
      x: origin.x + Math.cos(angle - halfAngle) * range,
      y: origin.y + Math.sin(angle - halfAngle) * range,
    };
    const right = {
      x: origin.x + Math.cos(angle + halfAngle) * range,
      y: origin.y + Math.sin(angle + halfAngle) * range,
    };
    graphics.fillStyle(this.gameState.lamp.overheated ? 0xff7657 : 0xf4d06f, 0.3);
    graphics.fillTriangle(origin.x, origin.y, left.x, left.y, right.x, right.y);
    graphics.lineStyle(2, 0xf4d06f, 0.7);
    graphics.strokeTriangle(origin.x, origin.y, left.x, left.y, right.x, right.y);
  }
}

class PhaserVerticalSliceController implements VerticalSliceController {
  private disposed = false;
  private domResources: PhaserGlobalDomResources | null = null;
  private game: Phaser.Game | null = null;
  private operation: Promise<void> = Promise.resolve();
  private readonly manualSimulation = isManualSimulation();
  private readonly monitor = new RuntimeResourceMonitor();
  private resources: RuntimeResourceLedger | null = null;
  private scene: FloodgateScene | null = null;
  private currentSnapshot = createInitialSnapshot(COMPILED_PROJECT, this.manualSimulation);

  constructor(
    private readonly parent: HTMLElement,
    private readonly onSnapshot: VerticalSliceSnapshotListener,
  ) {
    this.onSnapshot(this.currentSnapshot);
  }

  async start(): Promise<void> {
    const resources = new RuntimeResourceLedger();
    const domResources = new PhaserGlobalDomResources();
    this.resources = resources;
    this.domResources = domResources;

    await new Promise<void>((resolveReady, reject) => {
      const scene = new FloodgateScene(
        COMPILED_PROJECT,
        this.manualSimulation,
        resources,
        () => {
          domResources.endCapture();
          this.publish();
          resolveReady();
        },
        () => this.publish(),
      );
      this.scene = scene;

      domResources.beginCapture();
      try {
        this.game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: this.parent,
          width: COMPILED_PROJECT.viewport.width,
          height: COMPILED_PROJECT.viewport.height,
          backgroundColor: '#071A2A',
          antialias: true,
          roundPixels: true,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          physics: {
            default: 'arcade',
            arcade: {
              gravity: { x: 0, y: 0 },
              debug: false,
              fixedStep: true,
              fps: 60,
            },
          },
          audio: { noAudio: true },
          scene,
        });
      } catch (error) {
        domResources.dispose();
        resources.dispose();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  snapshot(): VerticalSliceSnapshot {
    return this.currentSnapshot;
  }

  restart(): Promise<VerticalSliceSnapshot> {
    return this.enqueue(() => {
      this.assertActive();
      this.scene?.restartRun();
    });
  }

  advanceTicks(count: number): Promise<VerticalSliceSnapshot> {
    return this.enqueue(() => {
      this.assertActive();
      if (!this.manualSimulation) {
        throw new Error('advanceTicks는 top-level ?e2e=1 고정 tick 모드에서만 사용할 수 있습니다.');
      }
      if (!Number.isInteger(count) || count < 1 || count > 600) {
        throw new Error('advanceTicks count는 1 이상 600 이하의 정수여야 합니다.');
      }
      this.scene?.advanceFixedTicks(count);
    });
  }

  destroy(): Promise<VerticalSliceSnapshot> {
    const request = this.operation.then(async () => {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      const game = this.game;
      this.scene?.disposeOwnedResources();
      this.resources?.dispose();
      if (game) {
        await destroyPhaserGame(game, this.domResources);
      } else {
        this.domResources?.dispose();
      }
      this.game = null;
      this.scene = null;
      this.resources = null;
      this.domResources = null;
      const counts = this.monitor.measure(null);
      const canvasCount = this.parent.querySelectorAll('canvas').length;
      this.currentSnapshot = freezeSnapshot({
        ...this.currentSnapshot,
        phase: 'destroyed',
        input: { focused: false, pressedKeys: [] },
        player: {
          ...this.currentSnapshot.player,
          velocityX: 0,
          velocityY: 0,
        },
        resources: {
          canvasCount,
          listeners: counts.listeners,
          timers: counts.timers,
          colliders: 0,
          orphanCanvases: canvasCount,
          orphanListeners: counts.listeners,
          orphanTimers: counts.timers,
        },
      });
      this.onSnapshot(this.currentSnapshot);
    });
    this.operation = request.then(
      () => undefined,
      () => undefined,
    );
    return request.then(() => this.snapshot());
  }

  private enqueue(operation: () => void | Promise<void>): Promise<VerticalSliceSnapshot> {
    const request = this.operation.then(operation);
    this.operation = request.then(
      () => undefined,
      () => undefined,
    );
    return request.then(() => this.snapshot());
  }

  private assertActive(): void {
    if (this.disposed || !this.scene) {
      throw new Error('수직 절편 런타임이 이미 정리됐습니다.');
    }
  }

  private resourceSnapshot(): VerticalSliceResourceSnapshot {
    const counts = this.monitor.measure(this.resources);
    const ownedListeners =
      (this.resources?.activeListeners ?? 0) + (this.scene?.getInputListenerCount() ?? 0);
    return {
      canvasCount: this.parent.querySelectorAll('canvas').length,
      listeners: Math.max(counts.listeners, ownedListeners),
      timers: Math.max(counts.timers, this.resources?.activeTimers ?? 0),
      colliders: this.scene?.getColliderCount() ?? 0,
      orphanCanvases: 0,
      orphanListeners: 0,
      orphanTimers: 0,
    };
  }

  private publish(): void {
    if (this.disposed || !this.scene) {
      return;
    }
    this.currentSnapshot = this.scene.getSnapshot(this.resourceSnapshot());
    this.onSnapshot(this.currentSnapshot);
  }
}

export async function createVerticalSliceRuntime(
  parent: HTMLElement,
  onSnapshot: VerticalSliceSnapshotListener,
): Promise<VerticalSliceController> {
  const controller = new PhaserVerticalSliceController(parent, onSnapshot);
  await controller.start();
  return controller;
}

export { FIXED_DELTA_MS };
