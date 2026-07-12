import { describe, expect, it } from "vitest";

import { JSON_SCHEMA_FILES, generateJsonSchemas } from "../src/index.js";

describe("generateJsonSchemas", () => {
  it("모든 영속 계약을 Draft 2020-12 JSON Schema로 한 방향 생성한다", () => {
    const schemas = generateJsonSchemas();

    expect(Object.keys(schemas)).toEqual(Object.keys(JSON_SCHEMA_FILES));
    expect(schemas.gameProject).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: expect.stringContaining("game-project.schema.json"),
      type: "object",
    });
    expect(schemas.projectBundle).toMatchObject({
      $id: expect.stringContaining("project-bundle.schema.json"),
      type: "object",
    });
  });
});
