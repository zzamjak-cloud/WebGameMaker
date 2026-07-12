import { describe, expect, it } from "vitest";

import {
  AssetSchema,
  ModuleManifestSchema,
  UiScreenSchema,
  migrateDocument,
  SchemaMigrationError,
} from "../src/index.js";

const legacyAssetV1 = {
  schemaVersion: 1,
  id: "asset.harbor-beacon",
  name: "Harbor Beacon",
  type: "image",
  mimeType: "image/png",
  extension: "png",
  byteSize: 128,
  sha256: `sha256:${"a".repeat(64)}`,
  tags: ["harbor"],
} as const;

describe("Phase 2 schema contracts", () => {
  it("asset/module/ui schema와 v1 identity 마이그레이션을 통과한다", () => {
    expect(AssetSchema.parse(legacyAssetV1).id).toBe("asset.harbor-beacon");
    expect(
      ModuleManifestSchema.parse({
        schemaVersion: 1,
        id: "module.health",
        version: "1.0.0",
        category: "combat",
        description: "체력",
        tags: ["p0"],
        engine: { name: "phaser", minimumVersion: "4.2.1" },
        minimumSchemaVersion: 1,
        configSchemaId: "config.health",
        requiredCapabilities: ["eventBus"],
        emits: [],
        listens: [],
        dependencies: [],
      }).id,
    ).toBe("module.health");
    expect(
      UiScreenSchema.parse({
        schemaVersion: 1,
        id: "ui.hud",
        name: "HUD",
        viewport: { width: 1280, height: 720 },
        elements: [],
      }).id,
    ).toBe("ui.hud");

    const migrated = migrateDocument("asset", { ...legacyAssetV1 });
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated).toEqual(legacyAssetV1);
  });

  it("미래 버전 목표는 마이그레이션 부재 시 실패한다", () => {
    expect(() => migrateDocument("asset", { ...legacyAssetV1 }, 2)).toThrow(
      SchemaMigrationError,
    );
  });
});
