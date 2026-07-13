import assetCatalog from '../../../../library/catalogs/assets.catalog.json' with { type: 'json' };
import floodgateProject from '../../../../games/floodgate-07/game.project.json' with { type: 'json' };
import floodgateScene from '../../../../games/floodgate-07/scenes/main.scene.json' with { type: 'json' };
import relayProject from '../../../../games/relay-ward/game.project.json' with { type: 'json' };
import relayScene from '../../../../games/relay-ward/scenes/main.scene.json' with { type: 'json' };
import cameraFollowManifest from '../../../../packages/core-modules/manifests/camera-follow.manifest.json' with { type: 'json' };
import collisionLayerManifest from '../../../../packages/core-modules/manifests/collision-layer.manifest.json' with { type: 'json' };
import enemyChaseManifest from '../../../../packages/core-modules/manifests/enemy-chase.manifest.json' with { type: 'json' };
import enemyPatrolManifest from '../../../../packages/core-modules/manifests/enemy-patrol.manifest.json' with { type: 'json' };
import healthManifest from '../../../../packages/core-modules/manifests/health.manifest.json' with { type: 'json' };
import playerMoveManifest from '../../../../packages/core-modules/manifests/player-move-2d.manifest.json' with { type: 'json' };
import type {
  StudioAssetEntry,
  StudioModuleEntry,
  StudioProjectSource,
} from './studioTypes';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {};
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function modulesOf(entity: JsonRecord): JsonRecord[] {
  const modules = entity.modules;
  return Array.isArray(modules) ? modules.map(asRecord) : [];
}

function moduleConfig(entity: JsonRecord, moduleId: string): JsonRecord {
  const found = modulesOf(entity).find(
    (binding) => binding.enabled === true && binding.moduleId === moduleId,
  );
  return asRecord(found?.config);
}

function collectModuleIds(entities: JsonRecord[]): string[] {
  return [
    ...new Set(
      entities.flatMap((entity) =>
        modulesOf(entity)
          .filter((binding) => binding.enabled === true)
          .map((binding) => String(binding.moduleId)),
      ),
    ),
  ].sort();
}

function moduleConfigPath(entities: JsonRecord[], moduleId: string, configKey: string): string {
  for (const [entityIndex, entity] of entities.entries()) {
    const bindingIndex = modulesOf(entity).findIndex(
      (binding) => binding.enabled === true && binding.moduleId === moduleId,
    );
    if (bindingIndex >= 0) {
      return `/entities/${entityIndex}/modules/${bindingIndex}/config/${configKey}`;
    }
  }
  return '';
}

function createSource(
  projectInput: unknown,
  sceneInput: unknown,
  paths: { projectPath: string; scenePath: string },
): StudioProjectSource {
  const project = asRecord(projectInput);
  const scene = asRecord(sceneInput);
  const entities = Array.isArray(scene.entities) ? scene.entities.map(asRecord) : [];
  const player = entities.find((entity) =>
    modulesOf(entity).some((binding) => binding.moduleId === 'module.player-move-2d'),
  );
  const firstEnemy = entities.find((entity) =>
    modulesOf(entity).some((binding) => binding.moduleId === 'module.enemy-patrol'),
  );
  return {
    id: String(project.id),
    name: String(project.name),
    designId: String(project.designId),
    projectPath: paths.projectPath,
    sceneId: String(scene.id),
    scenePath: paths.scenePath,
    sceneName: String(scene.name),
    viewport: asRecord(project.viewport) as StudioProjectSource['viewport'],
    entityCount: entities.length,
    moduleIds: collectModuleIds(entities),
    playerSpeed: asNumber(moduleConfig(asRecord(player), 'module.player-move-2d').speed, 240),
    firstEnemyPatrolSpeed: asNumber(
      moduleConfig(asRecord(firstEnemy), 'module.enemy-patrol').speed,
      70,
    ),
    playerMovePath: moduleConfigPath(entities, 'module.player-move-2d', 'speed'),
    firstEnemyPatrolPath: moduleConfigPath(entities, 'module.enemy-patrol', 'speed'),
    enemyCount: entities.filter((entity) =>
      modulesOf(entity).some((binding) => binding.moduleId === 'module.enemy-patrol'),
    ).length,
    objectiveCount: entities.filter((entity) =>
      modulesOf(entity).some((binding) =>
        ['module.signal-beacon', 'module.relay-node'].includes(String(binding.moduleId)),
      ),
    ).length,
  };
}

function moduleEntry(input: unknown): StudioModuleEntry {
  const manifest = asRecord(input);
  return {
    id: String(manifest.id),
    category: String(manifest.category),
    description: String(manifest.description),
    requiredCapabilities: Array.isArray(manifest.requiredCapabilities)
      ? manifest.requiredCapabilities.map(String)
      : [],
  };
}

export const STUDIO_PROJECTS = [
  createSource(floodgateProject, floodgateScene, {
    projectPath: 'games/floodgate-07/game.project.json',
    scenePath: 'games/floodgate-07/scenes/main.scene.json',
  }),
  createSource(relayProject, relayScene, {
    projectPath: 'games/relay-ward/game.project.json',
    scenePath: 'games/relay-ward/scenes/main.scene.json',
  }),
] as const;

export const STUDIO_ASSETS: StudioAssetEntry[] = Array.isArray(
  asRecord(assetCatalog).assets,
)
  ? (asRecord(assetCatalog).assets as unknown[]).map((asset) => {
      const entry = asRecord(asset);
      return {
        id: String(entry.id),
        name: String(entry.name),
        mimeType: String(entry.mimeType),
        extension: String(entry.extension),
        tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      };
    })
  : [];

export const STUDIO_MODULES: StudioModuleEntry[] = [
  playerMoveManifest,
  cameraFollowManifest,
  healthManifest,
  enemyPatrolManifest,
  enemyChaseManifest,
  collisionLayerManifest,
].map(moduleEntry);
