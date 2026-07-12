import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STUDIO_ASSETS, STUDIO_MODULES, STUDIO_PROJECTS } from './studioData';
import {
  createPreviewSrcDoc,
  isPreviewMessage,
  postPreviewSnapshot,
  requestPreviewCleanup,
} from './studioPreview';
import type { PreviewMessage } from './studioPreview';
import type { SavedStudioDraft, StudioDraft } from './studioTypes';
import {
  buildPreviewSnapshot,
  cloneDraft,
  createInitialDraft,
  findProject,
  formatSavedAt,
  loadDraft,
  saveDraft,
} from './studioWorkspace';

interface DraftHistory {
  past: StudioDraft[];
  present: StudioDraft;
  future: StudioDraft[];
}

interface CleanupStatus {
  listeners: number;
  timers: number;
  rafs: number;
  canvases: number;
}

function createHistory(draft: StudioDraft): DraftHistory {
  return {
    past: [],
    present: cloneDraft(draft),
    future: [],
  };
}

function sameDraft(left: StudioDraft, right: StudioDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function StudioView() {
  const initialProject = STUDIO_PROJECTS[0]!;
  const initialLoad = loadDraft(initialProject);
  const [projectId, setProjectId] = useState(initialProject.id);
  const [saved, setSaved] = useState<SavedStudioDraft | undefined>(initialLoad.saved);
  const [history, setHistory] = useState(() => createHistory(initialLoad.draft));
  const [previewRunId, setPreviewRunId] = useState(1);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewState, setPreviewState] = useState({
    title: initialLoad.draft.hud.title,
    objectiveLabel: initialLoad.draft.hud.objectiveLabel,
    accentColor: initialLoad.draft.hud.accentColor,
  });
  const [cleanup, setCleanup] = useState<CleanupStatus>({
    listeners: 0,
    timers: 0,
    rafs: 0,
    canvases: 0,
  });
  const [resetCount, setResetCount] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const project = useMemo(() => findProject(projectId), [projectId]);
  const draft = history.present;
  const initialDraft = useMemo(() => createInitialDraft(project), [project]);
  const dirty = !sameDraft(draft, saved?.draft ?? initialDraft);
  const previewSnapshot = useMemo(
    () => buildPreviewSnapshot(project, draft),
    [draft, project],
  );
  const previewSrcDoc = useMemo(
    () => createPreviewSrcDoc(previewRunId),
    [previewRunId],
  );

  const commitDraft = useCallback((next: StudioDraft) => {
    setHistory((current) => {
      if (sameDraft(current.present, next)) {
        return current;
      }
      return {
        past: [...current.past, cloneDraft(current.present)].slice(-30),
        present: cloneDraft(next),
        future: [],
      };
    });
  }, []);

  const updateDraft = useCallback(
    (mutate: (draft: StudioDraft) => void) => {
      const next = cloneDraft(draft);
      mutate(next);
      commitDraft(next);
    },
    [commitDraft, draft],
  );

  const restartPreview = useCallback(() => {
    if (frameRef.current?.contentWindow) {
      requestPreviewCleanup(frameRef.current);
    } else {
      setPreviewReady(false);
      setPreviewRunId((value) => value + 1);
    }
  }, []);

  const selectProject = useCallback((nextProjectId: string) => {
    const nextProject = findProject(nextProjectId);
    const nextLoad = loadDraft(nextProject);
    setProjectId(nextProjectId);
    setSaved(nextLoad.saved);
    setHistory(createHistory(nextLoad.draft));
    setPreviewReady(false);
    setPreviewRunId((value) => value + 1);
    setResetCount(0);
    setCleanup({ listeners: 0, timers: 0, rafs: 0, canvases: 0 });
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !isPreviewMessage(event.data)
      ) {
        return;
      }
      const message = event.data as PreviewMessage;
      if (message.runId !== previewRunId) {
        return;
      }
      if (message.type === 'studio-preview:ready') {
        setPreviewReady(true);
        postPreviewSnapshot(frameRef.current, previewSnapshot);
      }
      if (message.type === 'studio-preview:state') {
        setPreviewState({
          title: message.title,
          objectiveLabel: message.objectiveLabel,
          accentColor: message.accentColor,
        });
      }
      if (message.type === 'studio-preview:cleanup') {
        setCleanup(message.resources);
        setResetCount((value) => value + 1);
        setPreviewReady(false);
        setPreviewRunId((value) => value + 1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [previewRunId, previewSnapshot]);

  useEffect(() => {
    if (previewReady) {
      postPreviewSnapshot(frameRef.current, previewSnapshot);
    }
  }, [previewReady, previewSnapshot]);

  const undo = () => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) {
        return current;
      }
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [cloneDraft(current.present), ...current.future],
      };
    });
  };

  const redo = () => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) {
        return current;
      }
      return {
        past: [...current.past, cloneDraft(current.present)],
        present: next,
        future: current.future.slice(1),
      };
    });
  };

  const onSave = () => {
    const savedDraft = saveDraft(draft, saved);
    setSaved(savedDraft);
    restartPreview();
  };

  return (
    <main
      className="studio-shell"
      data-dirty={dirty}
      data-project-id={project.id}
      data-testid="studio-root"
    >
      <header className="studio-topbar">
        <div>
          <p className="eyebrow">Phase 5 Studio MVP</p>
          <h1>WebGameMaker Studio</h1>
        </div>
        <div className="studio-commandbar" aria-label="Studio commands">
          <button type="button" onClick={undo} disabled={history.past.length === 0}>
            Undo
          </button>
          <button type="button" onClick={redo} disabled={history.future.length === 0}>
            Redo
          </button>
          <button type="button" onClick={restartPreview}>
            Play
          </button>
          <button type="button" onClick={restartPreview} data-testid="studio-reset-preview">
            Reset
          </button>
          <button type="button" onClick={onSave} data-testid="studio-save">
            Save
          </button>
        </div>
      </header>

      <section className="studio-grid">
        <aside className="studio-rail" aria-label="Project navigator">
          <p className="rail-label">Projects</p>
          <div className="studio-project-switcher" role="tablist" aria-label="Projects">
            {STUDIO_PROJECTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === project.id}
                data-testid={`studio-project-${item.id}`}
                onClick={() => selectProject(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>

          <p className="rail-label">Tree</p>
          <ul className="studio-tree" data-testid="studio-file-tree">
            <li>{project.id}</li>
            <li>{project.designId}</li>
            <li>{project.sceneId}</li>
            <li>{project.entityCount} entities</li>
            <li>{project.moduleIds.length} module bindings</li>
          </ul>

          <div
            className="studio-save-state"
            data-dirty={dirty}
            data-testid="studio-save-state"
          >
            {dirty ? '수정됨' : '저장됨'} · rev {saved?.revision ?? 0} ·{' '}
            {formatSavedAt(saved)}
          </div>
        </aside>

        <section className="studio-stage" aria-label="Editor canvas">
          <div className="studio-canvas-bar">
            <div>
              <p className="rail-label">Canvas</p>
              <h2>{draft.hud.title}</h2>
            </div>
            <output
              className="studio-preview-status"
              data-ready={previewReady}
              data-title={previewState.title}
              data-objective={previewState.objectiveLabel}
              data-testid="studio-preview-status"
            >
              {previewReady ? 'Preview ready' : 'Preview booting'}
            </output>
          </div>

          <div className="studio-canvas" data-testid="studio-editor-canvas">
            <div
              className="studio-hud-ghost"
              style={{
                left: draft.hud.offsetX,
                top: draft.hud.offsetY,
                borderColor: draft.hud.accentColor,
              }}
            >
              <strong>{draft.hud.title}</strong>
              <span>{draft.hud.objectiveLabel}</span>
            </div>
            <div className="studio-player-token" style={{ background: draft.hud.accentColor }} />
            <div className="studio-enemy-token studio-enemy-token-a" />
            <div className="studio-enemy-token studio-enemy-token-b" />
            <div className="studio-node-token studio-node-token-a" />
            <div className="studio-node-token studio-node-token-b" />
            <div className="studio-node-token studio-node-token-c" />
          </div>

          <iframe
            key={previewRunId}
            ref={frameRef}
            className="studio-preview-frame"
            title="Studio play preview"
            sandbox="allow-scripts"
            srcDoc={previewSrcDoc}
            data-testid="studio-preview-frame"
            onLoad={() => postPreviewSnapshot(frameRef.current, previewSnapshot)}
          />

          <div
            className="studio-cleanup"
            data-listeners={cleanup.listeners}
            data-timers={cleanup.timers}
            data-raf={cleanup.rafs}
            data-canvases={cleanup.canvases}
            data-reset-count={resetCount}
            data-testid="studio-cleanup-status"
          >
            cleanup L{cleanup.listeners} T{cleanup.timers} R{cleanup.rafs} C
            {cleanup.canvases}
          </div>
        </section>

        <aside className="studio-inspector" aria-label="Inspector">
          <section>
            <p className="rail-label">HUD</p>
            <label>
              Title
              <input
                value={draft.hud.title}
                data-testid="studio-hud-title-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.hud.title = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Objective
              <input
                value={draft.hud.objectiveLabel}
                data-testid="studio-objective-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.hud.objectiveLabel = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Accent
              <input
                type="color"
                value={draft.hud.accentColor}
                data-testid="studio-accent-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.hud.accentColor = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Offset X
              <input
                type="range"
                min="8"
                max="340"
                value={draft.hud.offsetX}
                data-testid="studio-offset-x-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.hud.offsetX = Number(event.target.value);
                  })
                }
              />
            </label>
            <label>
              Offset Y
              <input
                type="range"
                min="8"
                max="220"
                value={draft.hud.offsetY}
                data-testid="studio-offset-y-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.hud.offsetY = Number(event.target.value);
                  })
                }
              />
            </label>
          </section>

          <section>
            <p className="rail-label">Gameplay</p>
            <label>
              Player speed
              <input
                type="number"
                min="80"
                max="520"
                value={draft.gameplay.playerSpeed}
                data-testid="studio-player-speed-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.gameplay.playerSpeed = clamp(Number(event.target.value), 80, 520);
                  })
                }
              />
            </label>
            <label>
              First patrol speed
              <input
                type="number"
                min="20"
                max="240"
                value={draft.gameplay.firstEnemyPatrolSpeed}
                data-testid="studio-enemy-speed-input"
                onChange={(event) =>
                  updateDraft((next) => {
                    next.gameplay.firstEnemyPatrolSpeed = clamp(
                      Number(event.target.value),
                      20,
                      240,
                    );
                  })
                }
              />
            </label>
          </section>

          <section>
            <p className="rail-label">Assets</p>
            <div className="studio-browser" data-testid="studio-asset-browser">
              {STUDIO_ASSETS.map((asset) => (
                <span key={asset.id}>
                  {asset.id} · {asset.extension}
                </span>
              ))}
            </div>
          </section>

          <section>
            <p className="rail-label">Modules</p>
            <div className="studio-browser" data-testid="studio-module-browser">
              {STUDIO_MODULES.map((module) => (
                <span key={module.id}>
                  {module.id} · {module.category}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
