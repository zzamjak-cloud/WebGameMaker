import type { PreviewSnapshot } from './studioTypes';

export type PreviewMessage =
  | {
      type: 'studio-preview:ready';
      runId: number;
    }
  | {
      type: 'studio-preview:state';
      runId: number;
      title: string;
      objectiveLabel: string;
      accentColor: string;
    }
  | {
      type: 'studio-preview:cleanup';
      runId: number;
      resources: {
        listeners: number;
        timers: number;
        rafs: number;
        canvases: number;
      };
    };

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (typeof message.runId !== 'number') {
    return false;
  }
  if (message.type === 'studio-preview:ready') {
    return true;
  }
  if (message.type === 'studio-preview:state') {
    return (
      typeof message.title === 'string' &&
      typeof message.objectiveLabel === 'string' &&
      typeof message.accentColor === 'string'
    );
  }
  if (message.type === 'studio-preview:cleanup') {
    const resources = message.resources as Record<string, unknown> | undefined;
    return (
      typeof resources?.listeners === 'number' &&
      typeof resources.timers === 'number' &&
      typeof resources.rafs === 'number' &&
      typeof resources.canvases === 'number'
    );
  }
  return false;
}

export function postPreviewSnapshot(
  frame: HTMLIFrameElement | null,
  snapshot: PreviewSnapshot,
): void {
  frame?.contentWindow?.postMessage(
    {
      type: 'studio-preview:update',
      snapshot,
    },
    '*',
  );
}

export function requestPreviewCleanup(frame: HTMLIFrameElement | null): void {
  frame?.contentWindow?.postMessage({ type: 'studio-preview:destroy' }, '*');
}

export function createPreviewSrcDoc(runId: number): string {
  const runIdJson = JSON.stringify(runId);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #101820; color: #f7f2df; font: 13px system-ui, sans-serif; }
#root { position: relative; width: 100%; height: 100%; }
canvas { display: block; width: 100%; height: 100%; }
.hud { position: absolute; min-width: 180px; padding: 10px 12px; border: 1px solid rgba(247, 242, 223, .5); background: rgba(16, 24, 32, .78); box-shadow: 4px 4px 0 rgba(0, 0, 0, .18); }
.hud strong { display: block; margin-bottom: 5px; font-size: 15px; }
.hud span { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; text-transform: uppercase; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(() => {
  const runId = ${runIdJson};
  const root = document.getElementById('root');
  const resources = { listeners: 0, timers: 0, rafs: 0, canvases: 0 };
  const tracked = { listeners: [], timers: new Set(), rafs: new Set(), canvas: null, hud: null, hudTitle: null, hudMeta: null };
  let snapshot = null;

  function post(type, payload) {
    parent.postMessage({ type, runId, ...payload }, '*');
  }

  function addTrackedListener(target, type, handler) {
    target.addEventListener(type, handler);
    tracked.listeners.push([target, type, handler]);
    resources.listeners += 1;
  }

  function addTrackedTimer() {
    const id = setInterval(() => draw(), 1000);
    tracked.timers.add(id);
    resources.timers += 1;
  }

  function addTrackedRaf() {
    let id = 0;
    const tick = () => {
      draw();
      id = requestAnimationFrame(tick);
      tracked.rafs.delete(id);
      tracked.rafs.add(id);
      resources.rafs = tracked.rafs.size;
    };
    id = requestAnimationFrame(tick);
    tracked.rafs.add(id);
    resources.rafs = tracked.rafs.size;
  }

  function draw() {
    if (!snapshot || !tracked.canvas || !tracked.hud) return;
    const canvas = tracked.canvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#16242c';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(247, 242, 223, .16)';
    for (let x = 0; x < width; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 48) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.fillStyle = snapshot.draft.hud.accentColor;
    ctx.fillRect(78, height - 118, 38, 38);
    ctx.fillStyle = '#f7f2df';
    for (let index = 0; index < snapshot.entities.enemyCount; index += 1) {
      ctx.beginPath();
      ctx.arc(width * .42 + index * 92, height * .52 - index * 36, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = snapshot.draft.hud.accentColor;
    ctx.lineWidth = 4;
    for (let index = 0; index < snapshot.entities.objectiveCount; index += 1) {
      ctx.strokeRect(width * .27 + index * 170, 58 + index * 10, 42, 42);
    }
    tracked.hud.style.left = snapshot.draft.hud.offsetX + 'px';
    tracked.hud.style.top = snapshot.draft.hud.offsetY + 'px';
    tracked.hud.style.borderColor = snapshot.draft.hud.accentColor;
    tracked.hudTitle.textContent = snapshot.draft.hud.title;
    tracked.hudMeta.textContent = snapshot.draft.hud.objectiveLabel + ' · speed ' + snapshot.draft.gameplay.playerSpeed;
    post('studio-preview:state', {
      title: snapshot.draft.hud.title,
      objectiveLabel: snapshot.draft.hud.objectiveLabel,
      accentColor: snapshot.draft.hud.accentColor
    });
  }

  function boot() {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    canvas.setAttribute('aria-label', 'Studio preview canvas');
    const hud = document.createElement('div');
    hud.className = 'hud';
    const hudTitle = document.createElement('strong');
    const hudMeta = document.createElement('span');
    hud.append(hudTitle, hudMeta);
    root.append(canvas, hud);
    tracked.canvas = canvas;
    tracked.hud = hud;
    tracked.hudTitle = hudTitle;
    tracked.hudMeta = hudMeta;
    resources.canvases = 1;
    addTrackedListener(window, 'keydown', () => {});
    addTrackedTimer();
    addTrackedRaf();
    post('studio-preview:ready', {});
  }

  function cleanup() {
    for (const [target, type, handler] of tracked.listeners.splice(0)) {
      target.removeEventListener(type, handler);
    }
    resources.listeners = 0;
    for (const id of tracked.timers) clearInterval(id);
    tracked.timers.clear();
    resources.timers = 0;
    for (const id of tracked.rafs) cancelAnimationFrame(id);
    tracked.rafs.clear();
    resources.rafs = 0;
    tracked.canvas?.remove();
    tracked.hud?.remove();
    tracked.canvas = null;
    tracked.hud = null;
    resources.canvases = root.querySelectorAll('canvas').length;
    post('studio-preview:cleanup', { resources });
  }

  addEventListener('message', (event) => {
    if (event.data?.type === 'studio-preview:update') {
      snapshot = event.data.snapshot;
      draw();
    }
    if (event.data?.type === 'studio-preview:destroy') cleanup();
  });

  boot();
})();
</script>
</body>
</html>`;
}
