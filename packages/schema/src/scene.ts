import { z } from "zod";

z.config({ jitless: true });

import { EntitySchema } from "./entity.js";
import { StableIdSchema } from "./stable-id.js";

export const SceneSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    name: z.string().min(1).max(120),
    type: z.enum(["world", "ui"]),
    entities: z.array(EntitySchema),
  })
  .meta({
    title: "Scene",
    description: "월드 또는 UI 장면과 그 엔티티 목록",
  });

export type Scene = z.infer<typeof SceneSchema>;
