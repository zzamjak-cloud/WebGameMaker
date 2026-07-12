import { STUDIO_PROJECTS } from './studioData';
import type {
  PreviewSnapshot,
  SavedStudioDraft,
  StudioDraft,
  StudioProjectSource,
} from './studioTypes';

const STORAGE_PREFIX = 'wgm.phase5.studio.';

export function createInitialDraft(project: StudioProjectSource): StudioDraft {
  const isRelay = project.id === 'game.relay-ward';
  return {
    projectId: project.id,
    hud: {
      title: project.name,
      objectiveLabel: isRelay ? 'Relay 0/3' : 'Beacons 0/3',
      accentColor: isRelay ? '#2f5bff' : '#f36f3d',
      offsetX: 32,
      offsetY: 28,
    },
    gameplay: {
      playerSpeed: project.playerSpeed,
      firstEnemyPatrolSpeed: project.firstEnemyPatrolSpeed,
    },
  };
}

export function cloneDraft(draft: StudioDraft): StudioDraft {
  return {
    projectId: draft.projectId,
    hud: { ...draft.hud },
    gameplay: { ...draft.gameplay },
  };
}

export function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function loadSavedDraft(projectId: string): SavedStudioDraft | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as SavedStudioDraft;
    return parsed.projectId === projectId ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function loadDraft(project: StudioProjectSource): {
  draft: StudioDraft;
  saved?: SavedStudioDraft;
} {
  const saved = loadSavedDraft(project.id);
  if (saved) {
    return { draft: cloneDraft(saved.draft), saved };
  }
  return { draft: createInitialDraft(project) };
}

export function saveDraft(draft: StudioDraft, previous?: SavedStudioDraft): SavedStudioDraft {
  const saved: SavedStudioDraft = {
    projectId: draft.projectId,
    revision: (previous?.revision ?? 0) + 1,
    savedAt: new Date().toISOString(),
    draft: cloneDraft(draft),
  };
  window.localStorage.setItem(storageKey(draft.projectId), JSON.stringify(saved));
  return saved;
}

export function findProject(projectId: string): StudioProjectSource {
  const project = STUDIO_PROJECTS.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Studio 프로젝트를 찾을 수 없습니다: ${projectId}`);
  }
  return project;
}

export function buildPreviewSnapshot(
  project: StudioProjectSource,
  draft: StudioDraft,
): PreviewSnapshot {
  return {
    projectId: project.id,
    projectName: project.name,
    viewport: project.viewport,
    draft: cloneDraft(draft),
    entities: {
      playerSpeed: draft.gameplay.playerSpeed,
      enemyCount: project.enemyCount,
      objectiveCount: project.objectiveCount,
    },
  };
}

export function formatSavedAt(saved?: SavedStudioDraft): string {
  if (!saved) {
    return '저장 전';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(saved.savedAt));
}
