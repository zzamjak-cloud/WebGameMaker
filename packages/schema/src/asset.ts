import { z } from "zod";

z.config({ jitless: true });

import { StableIdSchema } from "./stable-id.js";

export const AssetTypeSchema = z.enum(["image", "audio", "font", "other"]);

export const AssetSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    name: z.string().min(1).max(128),
    type: AssetTypeSchema,
    mimeType: z.string().min(3).max(128),
    extension: z.string().min(1).max(16),
    byteSize: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    tags: z.array(z.string().min(1).max(64)).default([]),
    license: z.string().min(1).max(128).optional(),
  })
  .meta({
    title: "Asset",
    description: "아트 리소스 메타데이터 sidecar",
  });

export type Asset = z.infer<typeof AssetSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
