import { z } from "zod";

export const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export const StableIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    STABLE_ID_PATTERN,
    "stable ID는 소문자로 시작하고 영문 소문자, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.",
  )
  .brand<"StableId">()
  .meta({
    title: "StableId",
    description: "저장과 재로딩 뒤에도 유지되는 안정 식별자",
  });

export type StableId = z.infer<typeof StableIdSchema>;
