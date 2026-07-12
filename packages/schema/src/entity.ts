import { z } from "zod";

import { ModuleBindingSchema } from "./module-binding.js";
import { StableIdSchema } from "./stable-id.js";
import { TransformSchema } from "./transform.js";

export const EntitySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    name: z.string().min(1).max(120),
    parentId: StableIdSchema.optional(),
    transform: TransformSchema,
    modules: z.array(ModuleBindingSchema),
  })
  .meta({
    title: "Entity",
    description: "장면에 배치되는 stable ID 기반 엔티티",
  });

export type Entity = z.infer<typeof EntitySchema>;
