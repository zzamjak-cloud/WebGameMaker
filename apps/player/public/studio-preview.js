(() => {
  const runId = Number(new URLSearchParams(window.location.search).get('runId') ?? '0');
  const root = document.getElementById('root');
  const resources = { listeners: 0, timers: 0, rafs: 0, canvases: 0 };
  const tracked = {
    listeners: [],
    timers: new Set(),
    rafs: new Set(),
    canvas: null,
    hud: null,
    hudTitle: null,
    hudMeta: null,
  };
  let snapshot = null;

  function post(type, payload) {
    window.parent.postMessage({ type, runId, ...payload }, '*');
  }

  function addTrackedListener(target, type, handler) {
    target.addEventListener(type, handler);
    tracked.listeners.push([target, type, handler]);
    resources.listeners += 1;
  }

  function addTrackedTimer() {
    const id = window.setInterval(() => draw(), 1000);
    tracked.timers.add(id);
    resources.timers += 1;
  }

  function addTrackedRaf() {
    let id = 0;
    const tick = () => {
      draw();
      id = window.requestAnimationFrame(tick);
      tracked.rafs.delete(id);
      tracked.rafs.add(id);
      resources.rafs = tracked.rafs.size;
    };
    id = window.requestAnimationFrame(tick);
    tracked.rafs.add(id);
    resources.rafs = tracked.rafs.size;
  }

  function draw() {
    if (!snapshot || !tracked.canvas || !tracked.hud) {
      return;
    }
    const canvas = tracked.canvas;
    const nextWidth = Number(snapshot.viewport?.width ?? 960);
    const nextHeight = Number(snapshot.viewport?.height ?? 540);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      root.dataset.viewportMode = snapshot.viewportMode ?? 'desktop';
    }
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#16242c';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(247, 242, 223, .16)';
    for (let x = 0; x < width; x += 48) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += 48) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.fillStyle = snapshot.draft.hud.accentColor;
    context.fillRect(78, height - 118, 38, 38);
    context.fillStyle = '#f7f2df';
    for (let index = 0; index < snapshot.entities.enemyCount; index += 1) {
      context.beginPath();
      context.arc(width * 0.42 + index * 92, height * 0.52 - index * 36, 18, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = snapshot.draft.hud.accentColor;
    context.lineWidth = 4;
    for (let index = 0; index < snapshot.entities.objectiveCount; index += 1) {
      context.strokeRect(width * 0.27 + index * 170, 58 + index * 10, 42, 42);
    }
    tracked.hud.style.left = `${snapshot.draft.hud.offsetX}px`;
    tracked.hud.style.top = `${snapshot.draft.hud.offsetY}px`;
    tracked.hud.style.borderColor = snapshot.draft.hud.accentColor;
    tracked.hudTitle.textContent = snapshot.draft.hud.title;
    tracked.hudMeta.textContent = `${snapshot.draft.hud.objectiveLabel} · speed ${snapshot.draft.gameplay.playerSpeed}`;
    post('studio-preview:state', {
      title: snapshot.draft.hud.title,
      objectiveLabel: snapshot.draft.hud.objectiveLabel,
      accentColor: snapshot.draft.hud.accentColor,
    });
  }

  function boot() {
    if (!root) {
      return;
    }
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
    for (const id of tracked.timers) {
      window.clearInterval(id);
    }
    tracked.timers.clear();
    resources.timers = 0;
    for (const id of tracked.rafs) {
      window.cancelAnimationFrame(id);
    }
    tracked.rafs.clear();
    resources.rafs = 0;
    tracked.canvas?.remove();
    tracked.hud?.remove();
    tracked.canvas = null;
    tracked.hud = null;
    resources.canvases = root?.querySelectorAll('canvas').length ?? 0;
    post('studio-preview:cleanup', { resources });
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'studio-preview:update') {
      snapshot = event.data.snapshot;
      draw();
    }
    if (event.data?.type === 'studio-preview:destroy') {
      cleanup();
    }
  });

  boot();
})();
