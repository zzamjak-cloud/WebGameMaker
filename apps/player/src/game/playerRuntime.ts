import Phaser from 'phaser';
import {
  cloneRuntimeSnapshot,
  INITIAL_RUNTIME_SNAPSHOT,
  type PlayerRuntimeController,
  type PulsePhase,
  type RuntimeProbeSnapshot,
  type RuntimeSnapshot,
} from './runtimeTypes';
import {
  destroyPhaserGame,
  PhaserGlobalDomResources,
  RuntimeResourceLedger,
  RuntimeResourceMonitor,
} from './phaserLifecycle';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;
const MOVE_SPEED = 230;
const PNG_KEY = 'compat-png';
const SVG_KEY = 'compat-svg';

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZhZQAAAAASUVORK5CYII=';

const SVG_SOURCE = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="28" fill="#F36F3D" stroke="#FFFFFF" stroke-width="4"/>
    <path d="M32 13 45 43 32 37 19 43Z" fill="#17233A" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
  </svg>
`;
// Phaser는 data URI를 Base64 경로로 처리하므로 SVG도 명시적으로 Base64로 전달한다.
const SVG_DATA_URI = `data:image/svg+xml;base64,${window.btoa(SVG_SOURCE)}`;

interface SceneSignals {
  assets: RuntimeSnapshot['assets'];
  systems: RuntimeSnapshot['systems'];
}

interface DirectionKeys {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
}

class CompatibilityScene extends Phaser.Scene {
  private barrier: Phaser.Physics.Arcade.Image | null = null;
  private collisionCount = 0;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private directionKeys: DirectionKeys | null = null;
  private loadFailed = false;
  private player: Phaser.Physics.Arcade.Image | null = null;
  private pngMarker: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly generation: number,
    private readonly resources: RuntimeResourceLedger,
    private readonly onReady: (signals: SceneSignals) => void,
  ) {
    super({ key: `compatibility-${generation}` });
  }

  preload(): void {
    this.load.once('loaderror', () => {
      this.loadFailed = true;
    });
    this.load.image(PNG_KEY, PNG_DATA_URI);
    this.load.svg(SVG_KEY, SVG_DATA_URI, { width: 64, height: 64 });
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.add.grid(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      80,
      80,
      0xe8ecea,
      1,
      0x86a5a9,
      0.32,
    );

    const pngMarker = this.add
      .image(840, 420, PNG_KEY)
      .setDisplaySize(52, 52)
      .setTint(0x2f5bff)
      .setAlpha(0.82);
    this.pngMarker = pngMarker;

    const barrier = this.physics.add
      .staticImage(700, 270, PNG_KEY)
      .setDisplaySize(190, 26)
      .setTint(0x2f5bff)
      .setAlpha(0.88);
    barrier.refreshBody();
    this.barrier = barrier;

    const player = this.physics.add
      .image(480, 270, SVG_KEY)
      .setDisplaySize(56, 56)
      .setCollideWorldBounds(true);
    player.setDamping(true).setDrag(0.001).setMaxVelocity(MOVE_SPEED, MOVE_SPEED);
    this.player = player;

    const collider = this.physics.add.collider(player, barrier, () => {
      this.collisionCount += 1;
    });
    const keyboard = this.input.keyboard;

    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.directionKeys = keyboard.addKeys('W,A,S,D') as DirectionKeys;
    }

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    camera.startFollow(player, true, 0.12, 0.12);
    camera.setZoom(1.04);

    this.add
      .text(24, 22, `RUNTIME ${String(this.generation).padStart(2, '0')}`, {
        color: '#17233A',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '14px',
        fontStyle: 'bold',
      })
      .setScrollFactor(0);
    this.add
      .text(24, 46, 'WASD / 방향키 이동 · Arcade Physics', {
        color: '#40566B',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
      })
      .setScrollFactor(0);

    const heartbeat = this.add
      .circle(GAME_WIDTH - 30, 30, 7, 0xf36f3d)
      .setScrollFactor(0);

    this.resources.listen('wgm:runtime-probe', () => {
      heartbeat.setAlpha(1);
    });
    this.resources.interval(() => {
      heartbeat.setAlpha(heartbeat.alpha > 0.8 ? 0.42 : 1);
    }, 500);

    this.onReady({
      assets: {
        png: !this.loadFailed && this.textures.exists(PNG_KEY),
        svg: !this.loadFailed && this.textures.exists(SVG_KEY),
      },
      systems: {
        physics: player.body instanceof Phaser.Physics.Arcade.Body,
        collision: collider.active,
        keyboard: this.cursors !== null && this.directionKeys !== null,
        // WebKit iframe에서는 첫 render 전 worldView가 0일 수 있어 설정된 viewport를 검증한다.
        camera: camera.width > 0 && camera.height > 0,
      },
    });
  }

  update(): void {
    if (!this.player || !this.cursors || !this.directionKeys) {
      return;
    }

    const horizontal =
      Number(this.cursors.right.isDown || this.directionKeys.D.isDown) -
      Number(this.cursors.left.isDown || this.directionKeys.A.isDown);
    const vertical =
      Number(this.cursors.down.isDown || this.directionKeys.S.isDown) -
      Number(this.cursors.up.isDown || this.directionKeys.W.isDown);

    if (horizontal === 0 && vertical === 0) {
      this.player.setVelocity(0, 0);
      return;
    }

    const direction = new Phaser.Math.Vector2(horizontal, vertical)
      .normalize()
      .scale(MOVE_SPEED);
    this.player.setVelocity(direction.x, direction.y);
  }

  getProbeSnapshot(): RuntimeProbeSnapshot | null {
    const barrier = this.barrier;
    const player = this.player;
    const pngMarker = this.pngMarker;

    if (!barrier || !player || !pngMarker) {
      return null;
    }

    const barrierBounds = barrier.getBounds();
    const playerBody = player.body;

    if (!(playerBody instanceof Phaser.Physics.Arcade.Body)) {
      return null;
    }

    // DOM Image.width는 Firefox data URI에서 0일 수 있어 Phaser가 디코딩한 frame 크기를 기준으로 삼는다.
    const pngSourceFrame = this.textures.get(PNG_KEY).get();
    const svgSourceFrame = this.textures.get(SVG_KEY).get();
    const camera = this.cameras.main;

    return {
      assets: {
        png: {
          sourceWidth: pngSourceFrame.realWidth,
          sourceHeight: pngSourceFrame.realHeight,
          displayWidth: pngMarker.displayWidth,
          displayHeight: pngMarker.displayHeight,
          scaleX: pngMarker.scaleX,
          scaleY: pngMarker.scaleY,
        },
        svg: {
          sourceWidth: svgSourceFrame.realWidth,
          sourceHeight: svgSourceFrame.realHeight,
          displayWidth: player.displayWidth,
          displayHeight: player.displayHeight,
          scaleX: player.scaleX,
          scaleY: player.scaleY,
        },
      },
      player: {
        x: player.x,
        y: player.y,
        velocityX: playerBody.velocity.x,
        velocityY: playerBody.velocity.y,
        displayWidth: player.displayWidth,
        displayHeight: player.displayHeight,
      },
      camera: {
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        zoom: camera.zoom,
      },
      barrier: {
        left: barrierBounds.left,
        right: barrierBounds.right,
        top: barrierBounds.top,
        bottom: barrierBounds.bottom,
        displayWidth: barrier.displayWidth,
        displayHeight: barrier.displayHeight,
      },
      collision: {
        count: this.collisionCount,
        blockedRight: playerBody.blocked.right,
        touchingRight: playerBody.touching.right,
      },
    };
  }
}

class PhaserRuntimeController implements PlayerRuntimeController {
  private disposed = false;
  private domResources: PhaserGlobalDomResources | null = null;
  private game: Phaser.Game | null = null;
  private operation: Promise<void> = Promise.resolve();
  private readonly resourceMonitor = new RuntimeResourceMonitor();
  private resources: RuntimeResourceLedger | null = null;
  private scene: CompatibilityScene | null = null;
  private snapshot = cloneRuntimeSnapshot(INITIAL_RUNTIME_SNAPSHOT);

  constructor(
    private readonly parent: HTMLElement,
    private readonly onSnapshot: (snapshot: RuntimeSnapshot) => void,
  ) {}

  async start(): Promise<void> {
    await this.createGame();
  }

  getSnapshot(): RuntimeSnapshot {
    return cloneRuntimeSnapshot(this.snapshot);
  }

  getProbeSnapshot(): RuntimeProbeSnapshot | null {
    return this.scene?.getProbeSnapshot() ?? null;
  }

  recreate(cycles: number): Promise<RuntimeSnapshot> {
    const safeCycles = Math.min(10, Math.max(1, Math.trunc(cycles)));
    const request = this.operation.then(() => this.performRecreate(safeCycles));
    this.operation = request.then(
      () => undefined,
      () => undefined,
    );
    return request.then(() => this.getSnapshot());
  }

  destroy(): Promise<void> {
    this.disposed = true;
    const request = this.operation.then(() => this.destroyGame());
    this.operation = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  private publish(patch: Partial<RuntimeSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      assets: patch.assets ? { ...patch.assets } : this.snapshot.assets,
      systems: patch.systems ? { ...patch.systems } : this.snapshot.systems,
      resources: patch.resources ? { ...patch.resources } : this.snapshot.resources,
      pulses: patch.pulses ? [...patch.pulses] : this.snapshot.pulses,
    };
    this.onSnapshot(this.getSnapshot());
  }

  private async performRecreate(cycles: number): Promise<void> {
    if (this.disposed) {
      throw new Error('이미 정리된 Phaser 런타임입니다.');
    }

    let pulses: [PulsePhase, PulsePhase, PulsePhase] = ['idle', 'idle', 'idle'];
    this.publish({ completedRecreateCycles: 0, pulses });

    for (let index = 0; index < cycles; index += 1) {
      const pulseIndex = index % pulses.length;
      pulses = [...pulses];
      pulses[pulseIndex] = 'destroying';
      this.publish({ phase: 'destroying', pulses });
      await this.destroyGame();

      pulses = [...pulses];
      pulses[pulseIndex] = 'creating';
      this.publish({ phase: 'booting', pulses });
      await this.createGame();

      pulses = [...pulses];
      pulses[pulseIndex] = 'ready';
      this.publish({
        completedRecreateCycles: index + 1,
        phase: 'ready',
        pulses,
      });
    }
  }

  private async createGame(): Promise<void> {
    const generation = this.snapshot.generation + 1;
    const domResources = new PhaserGlobalDomResources();
    const resources = new RuntimeResourceLedger();
    this.domResources = domResources;
    this.resources = resources;
    this.publish({
      phase: 'booting',
      generation,
      createCount: this.snapshot.createCount + 1,
      errorMessage: null,
      assets: { png: false, svg: false },
      systems: { physics: false, collision: false, keyboard: false, camera: false },
      resources: {
        ...this.snapshot.resources,
        canvasCount: 0,
        activeListeners: 0,
        activeTimers: 0,
      },
    });

    await new Promise<void>((resolve) => {
      const scene = new CompatibilityScene(generation, resources, (signals) => {
        domResources.endCapture();
        const allReady =
          Object.values(signals.assets).every(Boolean) &&
          Object.values(signals.systems).every(Boolean);
        // 테스트 프로브가 있으면 Ledger가 아닌 Phaser를 포함한 실제 전역 자원 차이를 표시한다.
        const activeResources = this.resourceMonitor.measure(resources);
        this.publish({
          phase: allReady ? 'ready' : 'error',
          errorMessage: allReady ? null : 'Phaser 호환성 신호 중 준비되지 않은 항목이 있습니다.',
          assets: signals.assets,
          systems: signals.systems,
          resources: {
            ...this.snapshot.resources,
            canvasCount: this.parent.querySelectorAll('canvas').length,
            activeListeners: activeResources.listeners,
            activeTimers: activeResources.timers,
          },
        });
        resolve();
      });
      this.scene = scene;

      domResources.beginCapture();
      try {
        this.game = new Phaser.Game({
          type: Phaser.CANVAS,
          parent: this.parent,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          backgroundColor: '#E8ECEA',
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
            },
          },
          // Phase 0은 오디오를 검증하지 않으므로 브라우저 unlock listener를 만들지 않는다.
          audio: {
            noAudio: true,
          },
          scene,
        });
      } catch (error) {
        domResources.dispose();
        throw error;
      }
    });
  }

  private async destroyGame(): Promise<void> {
    const game = this.game;
    const domResources = this.domResources;
    const resources = this.resources;

    if (!game) {
      return;
    }

    resources?.dispose();

    await destroyPhaserGame(game, domResources);

    const canvasCount = this.parent.querySelectorAll('canvas').length;
    const activeResources = this.resourceMonitor.measure(resources);

    this.game = null;
    this.domResources = null;
    this.resources = null;
    this.scene = null;
    this.publish({
      destroyCount: this.snapshot.destroyCount + 1,
      resources: {
        ...this.snapshot.resources,
        canvasCount,
        activeListeners: activeResources.listeners,
        activeTimers: activeResources.timers,
        orphanCanvases: this.snapshot.resources.orphanCanvases + canvasCount,
        orphanListeners: this.snapshot.resources.orphanListeners + activeResources.listeners,
        orphanTimers: this.snapshot.resources.orphanTimers + activeResources.timers,
      },
    });
  }
}

export async function createPlayerRuntime(
  parent: HTMLElement,
  onSnapshot: (snapshot: RuntimeSnapshot) => void,
): Promise<PlayerRuntimeController> {
  const controller = new PhaserRuntimeController(parent, onSnapshot);
  await controller.start();
  return controller;
}
