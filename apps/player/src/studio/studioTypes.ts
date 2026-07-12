export interface StudioProjectSource {
  id: string;
  name: string;
  designId: string;
  sceneId: string;
  viewport: { width: number; height: number };
  sceneName: string;
  entityCount: number;
  moduleIds: string[];
  playerSpeed: number;
  firstEnemyPatrolSpeed: number;
  enemyCount: number;
  objectiveCount: number;
}

export interface StudioDraft {
  projectId: string;
  hud: {
    title: string;
    objectiveLabel: string;
    accentColor: string;
    offsetX: number;
    offsetY: number;
  };
  gameplay: {
    playerSpeed: number;
    firstEnemyPatrolSpeed: number;
  };
}

export interface SavedStudioDraft {
  projectId: string;
  revision: number;
  savedAt: string;
  draft: StudioDraft;
}

export interface StudioAssetEntry {
  id: string;
  name: string;
  mimeType: string;
  extension: string;
  tags: string[];
}

export interface StudioModuleEntry {
  id: string;
  category: string;
  description: string;
  requiredCapabilities: string[];
}

export interface PreviewSnapshot {
  projectId: string;
  projectName: string;
  viewport: { width: number; height: number };
  draft: StudioDraft;
  entities: {
    playerSpeed: number;
    enemyCount: number;
    objectiveCount: number;
  };
}
