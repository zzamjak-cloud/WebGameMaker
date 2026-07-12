import { z } from "zod";

z.config({ jitless: true });

export const Vector2Schema = z
  .strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .meta({
    title: "Vector2",
    description: "2차원 좌표 또는 배율",
  });

export const TransformSchema = z
  .strictObject({
    position: Vector2Schema,
    rotation: z.number().finite(),
    scale: Vector2Schema,
  })
  .meta({
    title: "Transform",
    description: "엔티티의 2차원 위치, 회전 라디안, 배율",
  });

export type Vector2 = z.infer<typeof Vector2Schema>;
export type Transform = z.infer<typeof TransformSchema>;
