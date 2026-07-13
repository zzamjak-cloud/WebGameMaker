import { STUDIO_PROJECTS } from './studioData';
import type {
  DraftExportBundle,
  DraftValidationIssue,
  PreviewSnapshot,
  SavedStudioDraft,
  StudioFormFieldHint,
  StudioDraft,
  StudioProjectSource,
  StudioViewportMode,
} from './studioTypes';

const STORAGE_PREFIX = 'wgm.phase5.studio.';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

export const STUDIO_FORM_FIELDS: StudioFormFieldHint[] = [
  { field: 'hud.title', label: 'HUD title', type: 'text', maxLength: 200 },
  { field: 'hud.objectiveLabel', label: 'HUD objective', type: 'text', maxLength: 80 },
  { field: 'hud.accentColor', label: 'HUD accent', type: 'color' },
  { field: 'hud.offsetX', label: 'HUD offset X', type: 'number', minimum: 8, maximum: 340 },
  { field: 'hud.offsetY', label: 'HUD offset Y', type: 'number', minimum: 8, maximum: 220 },
  { field: 'gameplay.playerSpeed', label: 'Player speed', type: 'number', minimum: 80, maximum: 520 },
  {
    field: 'gameplay.firstEnemyPatrolSpeed',
    label: 'First patrol speed',
    type: 'number',
    minimum: 20,
    maximum: 240,
  },
];

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
  viewportMode: StudioViewportMode,
): PreviewSnapshot {
  const viewport = viewportMode === 'mobile' ? MOBILE_VIEWPORT : project.viewport;
  return {
    projectId: project.id,
    projectName: project.name,
    viewport,
    viewportMode,
    draft: cloneDraft(draft),
    entities: {
      playerSpeed: draft.gameplay.playerSpeed,
      enemyCount: project.enemyCount,
      objectiveCount: project.objectiveCount,
    },
  };
}

export function validateDraft(draft: StudioDraft): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  if (draft.hud.title.trim().length === 0 || draft.hud.title.length > 200) {
    issues.push({ field: 'hud.title', message: 'HUD title은 1~200자여야 합니다.' });
  }
  if (draft.hud.objectiveLabel.trim().length === 0 || draft.hud.objectiveLabel.length > 80) {
    issues.push({ field: 'hud.objectiveLabel', message: 'Objective는 1~80자여야 합니다.' });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.hud.accentColor)) {
    issues.push({ field: 'hud.accentColor', message: 'Accent는 #RRGGBB 색상이어야 합니다.' });
  }
  if (draft.hud.offsetX < 8 || draft.hud.offsetX > 340) {
    issues.push({ field: 'hud.offsetX', message: 'Offset X는 8~340 범위여야 합니다.' });
  }
  if (draft.hud.offsetY < 8 || draft.hud.offsetY > 220) {
    issues.push({ field: 'hud.offsetY', message: 'Offset Y는 8~220 범위여야 합니다.' });
  }
  if (draft.gameplay.playerSpeed < 80 || draft.gameplay.playerSpeed > 520) {
    issues.push({ field: 'gameplay.playerSpeed', message: 'Player speed는 80~520 범위여야 합니다.' });
  }
  if (draft.gameplay.firstEnemyPatrolSpeed < 20 || draft.gameplay.firstEnemyPatrolSpeed > 240) {
    issues.push({
      field: 'gameplay.firstEnemyPatrolSpeed',
      message: 'First patrol speed는 20~240 범위여야 합니다.',
    });
  }
  return issues;
}

export function buildDraftExportBundle(
  project: StudioProjectSource,
  draft: StudioDraft,
): DraftExportBundle {
  return {
    schemaVersion: 1,
    generatedBy: 'WebGameMaker Studio',
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    target: {
      projectPath: project.projectPath,
      scenePath: project.scenePath,
    },
    operations: [
      {
        file: project.projectPath,
        op: 'replace',
        path: '/name',
        value: draft.hud.title,
      },
      {
        file: project.scenePath,
        op: 'replace',
        path: project.playerMovePath,
        value: draft.gameplay.playerSpeed,
      },
      {
        file: project.scenePath,
        op: 'replace',
        path: project.firstEnemyPatrolPath,
        value: draft.gameplay.firstEnemyPatrolSpeed,
      },
    ],
    uiScreen: {
      schemaVersion: 1,
      id: `ui.${project.id.replace(/^game\./, '')}.hud`,
      name: `${draft.hud.title} HUD`,
      viewport: project.viewport,
      elements: [
        {
          id: 'ui.hud-title',
          kind: 'text',
          anchor: 'top-left',
          offset: { x: draft.hud.offsetX, y: draft.hud.offsetY },
          bindingKey: 'hud.title',
          text: draft.hud.title,
        },
        {
          id: 'ui.hud-objective',
          kind: 'text',
          anchor: 'top-left',
          offset: { x: draft.hud.offsetX, y: draft.hud.offsetY + 28 },
          bindingKey: 'hud.objective',
          text: draft.hud.objectiveLabel,
        },
      ],
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
