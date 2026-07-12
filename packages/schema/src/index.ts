export {
  AssetSchema,
  AssetTypeSchema,
  type Asset,
  type AssetType,
} from "./asset.js";
export {
  EntitySchema,
  type Entity,
} from "./entity.js";
export {
  GameProjectSchema,
  ViewportSchema,
  type GameProject,
  type Viewport,
} from "./game-project.js";
export {
  JSON_SCHEMA_FILES,
  generateJsonSchemas,
  type JsonSchemaName,
} from "./json-schema.js";
export {
  listMigrationSteps,
  migrateDocument,
  SchemaMigrationError,
  type DocumentKind,
  type MigrationStep,
  type VersionedDocument,
} from "./migrations/migrate.js";
export {
  ModuleBindingSchema,
  type ModuleBinding,
} from "./module-binding.js";
export {
  ModuleCapabilityNameSchema,
  ModuleManifestSchema,
  type ModuleCapabilityName,
  type ModuleManifest,
} from "./module-manifest.js";
export {
  ProjectBundleSchema,
  ProjectBundleStructureSchema,
  collectProjectBundleReferenceIssues,
  parseProjectBundle,
  validateProjectBundle,
  type ProjectBundle,
  type ProjectBundleReferenceIssue,
  type ProjectBundleReferenceIssueCode,
} from "./project-bundle.js";
export {
  SceneSchema,
  type Scene,
} from "./scene.js";
export {
  STABLE_ID_PATTERN,
  StableIdSchema,
  type StableId,
} from "./stable-id.js";
export {
  TransformSchema,
  Vector2Schema,
  type Transform,
  type Vector2,
} from "./transform.js";
export {
  UiAnchorSchema,
  UiScreenSchema,
  type UiAnchor,
  type UiScreen,
} from "./ui-screen.js";
