import { z } from "zod";

z.config({ jitless: true });

import { AssetSchema } from "./asset.js";
import { EntitySchema } from "./entity.js";
import { GameProjectSchema } from "./game-project.js";
import { ModuleBindingSchema } from "./module-binding.js";
import { ModuleManifestSchema } from "./module-manifest.js";
import { ProjectBundleStructureSchema } from "./project-bundle.js";
import { SceneSchema } from "./scene.js";
import { StableIdSchema } from "./stable-id.js";
import { TransformSchema } from "./transform.js";
import { UiScreenSchema } from "./ui-screen.js";

export const JSON_SCHEMA_FILES = {
  stableId: "stable-id.schema.json",
  transform: "transform.schema.json",
  moduleBinding: "module-binding.schema.json",
  entity: "entity.schema.json",
  scene: "scene.schema.json",
  gameProject: "game-project.schema.json",
  projectBundle: "project-bundle.schema.json",
  asset: "asset.schema.json",
  moduleManifest: "module-manifest.schema.json",
  uiScreen: "ui-screen.schema.json",
} as const;

export type JsonSchemaName = keyof typeof JSON_SCHEMA_FILES;

function generateJsonSchema(
  name: JsonSchemaName,
  schema: z.ZodType,
): Record<string, unknown> {
  return {
    ...z.toJSONSchema(schema, { target: "draft-2020-12" }),
    $id: `https://schemas.web-game-maker.dev/v1/${JSON_SCHEMA_FILES[name]}`,
  };
}

export function generateJsonSchemas(): Record<
  JsonSchemaName,
  Record<string, unknown>
> {
  return {
    stableId: generateJsonSchema("stableId", StableIdSchema),
    transform: generateJsonSchema("transform", TransformSchema),
    moduleBinding: generateJsonSchema("moduleBinding", ModuleBindingSchema),
    entity: generateJsonSchema("entity", EntitySchema),
    scene: generateJsonSchema("scene", SceneSchema),
    gameProject: generateJsonSchema("gameProject", GameProjectSchema),
    projectBundle: generateJsonSchema(
      "projectBundle",
      ProjectBundleStructureSchema,
    ),
    asset: generateJsonSchema("asset", AssetSchema),
    moduleManifest: generateJsonSchema(
      "moduleManifest",
      ModuleManifestSchema,
    ),
    uiScreen: generateJsonSchema("uiScreen", UiScreenSchema),
  };
}
