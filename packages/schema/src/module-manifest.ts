import { z } from "zod";

z.config({ jitless: true });

import { StableIdSchema } from "./stable-id.js";

export const ModuleCapabilityNameSchema = z.enum([
  "input",
  "clock",
  "random",
  "eventBus",
  "assets",
  "physics",
]);

export const ModuleManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    version: z.string().min(1).max(64),
    category: z.string().min(1).max(64),
    description: z.string().min(1).max(512),
    tags: z.array(z.string().min(1).max(64)).default([]),
    engine: z.strictObject({
      name: z.string().min(1).max(64),
      minimumVersion: z.string().min(1).max(64),
    }),
    minimumSchemaVersion: z.number().int().positive(),
    configSchemaId: StableIdSchema,
    requiredCapabilities: z.array(ModuleCapabilityNameSchema).default([]),
    emits: z.array(z.string().min(1).max(128)).default([]),
    listens: z.array(z.string().min(1).max(128)).default([]),
    dependencies: z.array(StableIdSchema).default([]),
  })
  .meta({
    title: "ModuleManifest",
    description: "공용 행동 모듈 선언과 capability 계약",
  });

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;
export type ModuleCapabilityName = z.infer<typeof ModuleCapabilityNameSchema>;
