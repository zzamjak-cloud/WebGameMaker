import { z } from "zod";

z.config({ jitless: true });

import { StableIdSchema } from "./stable-id.js";

export const ModuleBindingSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    moduleId: StableIdSchema,
    enabled: z.boolean(),
    targetEntityId: StableIdSchema.optional(),
    config: z.record(z.string(), z.json()),
  })
  .meta({
    title: "ModuleBinding",
    description: "엔티티에 연결한 재사용 모듈 인스턴스와 직렬화 가능한 설정",
  });

export type ModuleBinding = z.infer<typeof ModuleBindingSchema>;
