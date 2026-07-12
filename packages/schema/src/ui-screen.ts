import { z } from "zod";

z.config({ jitless: true });

import { StableIdSchema } from "./stable-id.js";

export const UiAnchorSchema = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

export const UiScreenSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: StableIdSchema,
    name: z.string().min(1).max(128),
    viewport: z.strictObject({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    elements: z
      .array(
        z.strictObject({
          id: StableIdSchema,
          kind: z.enum(["text", "bar", "icon", "button", "group"]),
          anchor: UiAnchorSchema,
          offset: z.strictObject({
            x: z.number(),
            y: z.number(),
          }),
          bindingKey: z.string().min(1).max(128).optional(),
          text: z.string().max(256).optional(),
        }),
      )
      .default([]),
  })
  .meta({
    title: "UiScreen",
    description: "게임 HUD/결과 화면 레이아웃 계약",
  });

export type UiScreen = z.infer<typeof UiScreenSchema>;
export type UiAnchor = z.infer<typeof UiAnchorSchema>;
