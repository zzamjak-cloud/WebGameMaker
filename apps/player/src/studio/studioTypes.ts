export interface StudioProjectSource {
  id: string;
  name: string;
  designId: string;
  projectPath: string;
  sceneId: string;
  scenePath: string;
  viewport: { width: number; height: number };
  sceneName: string;
  entityCount: number;
  moduleIds: string[];
  playerSpeed: number;
  firstEnemyPatrolSpeed: number;
  playerMovePath: string;
  firstEnemyPatrolPath: string;
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
  viewportMode: StudioViewportMode;
  draft: StudioDraft;
  entities: {
    playerSpeed: number;
    enemyCount: number;
    objectiveCount: number;
  };
}

export type StudioViewportMode = "desktop" | "mobile";

export interface DraftValidationIssue {
  field: string;
  message: string;
}

export interface StudioFormFieldHint {
  field: string;
  label: string;
  type: "text" | "color" | "number";
  minimum?: number;
  maximum?: number;
  maxLength?: number;
}

export interface DraftExportOperation {
  file: string;
  op: "replace";
  path: string;
  value: string | number;
}

export interface DraftExportBundle {
  schemaVersion: 1;
  generatedBy: "WebGameMaker Studio";
  generatedAt: string;
  projectId: string;
  target: {
    projectPath: string;
    scenePath: string;
  };
  operations: DraftExportOperation[];
  uiScreen: {
    schemaVersion: 1;
    id: string;
    name: string;
    viewport: { width: number; height: number };
    elements: Array<{
      id: string;
      kind: "text";
      anchor: "top-left";
      offset: { x: number; y: number };
      bindingKey: string;
      text: string;
    }>;
  };
}
