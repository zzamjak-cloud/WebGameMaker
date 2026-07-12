import { z } from "zod";

z.config({ jitless: true });

import { StableIdSchema } from "./stable-id.js";

export const ViewportSchema = z
  .strictObject({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  })
  .meta({
    title: "Viewport",
    description: "게임의 기준 해상도",
  });

export const GameProjectSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    name: z.string().min(1).max(120),
    designId: StableIdSchema,
    viewport: ViewportSchema,
    entrySceneId: StableIdSchema,
    sceneIds: z.array(StableIdSchema).min(1),
  })
  .meta({
    title: "GameProject",
    description: "스키마 버전 1 게임 프로젝트의 최소 영속 메타데이터",
  });

export type Viewport = z.infer<typeof ViewportSchema>;
export type GameProject = z.infer<typeof GameProjectSchema>;
