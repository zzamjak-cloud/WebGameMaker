import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  StableIdSchema,
  collectProjectBundleReferenceIssues,
  parseProjectBundle,
  validateProjectBundle,
  type ProjectBundle,
} from "../src/index.js";

function loadFixture(fileName: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${fileName}`, import.meta.url), "utf8"),
  );
}

function expectInvalidFixture(fileName: string, expectedMessage: string): void {
  const result = validateProjectBundle(loadFixture(fileName));

  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error(`fixture가 예상과 달리 유효합니다: ${fileName}`);
  }
  expect(
    result.error.issues.some((issue) => issue.message.includes(expectedMessage)),
  ).toBe(true);
}

function loadValidProjectBundle(): ProjectBundle {
  return parseProjectBundle(loadFixture("valid.bundle.json"));
}

function collectIssueCodes(bundle: ProjectBundle): string[] {
  return collectProjectBundleReferenceIssues(bundle).map((issue) => issue.code);
}

describe("ProjectBundleSchema", () => {
  it("정상 프로젝트와 장면 bundle을 검증한다", () => {
    const result = validateProjectBundle(loadFixture("valid.bundle.json"));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project.entrySceneId).toBe("scene.main");
      expect(result.data.scenes).toHaveLength(1);
    }
  });

  it("중복 stable ID를 거부한다", () => {
    expectInvalidFixture("duplicate-id.bundle.json", "중복된 엔티티 ID");
  });

  it("없는 진입 장면을 거부한다", () => {
    expectInvalidFixture(
      "missing-entry-scene.bundle.json",
      "진입 장면을 bundle에서 찾을 수 없습니다",
    );
  });

  it("엔티티를 찾을 수 없는 모듈 참조를 거부한다", () => {
    expectInvalidFixture(
      "invalid-reference.bundle.json",
      "모듈 대상 엔티티를 같은 장면에서 찾을 수 없습니다",
    );
  });

  it("중복 장면과 모듈 바인딩 ID를 함께 진단한다", () => {
    const bundle = loadValidProjectBundle();
    bundle.scenes.push(structuredClone(bundle.scenes[0]!));

    expect(collectIssueCodes(bundle)).toEqual(
      expect.arrayContaining([
        "duplicate_scene_id",
        "duplicate_module_binding_id",
      ]),
    );
  });

  it("중복 프로젝트 장면 ID와 미등록 bundle 장면을 진단한다", () => {
    const bundle = loadValidProjectBundle();
    bundle.project.sceneIds.push(bundle.project.sceneIds[0]!);

    const extraScene = structuredClone(bundle.scenes[0]!);
    extraScene.id = StableIdSchema.parse("scene.extra");
    extraScene.entities = [];
    bundle.scenes.push(extraScene);

    expect(collectIssueCodes(bundle)).toEqual(
      expect.arrayContaining([
        "duplicate_project_scene_id",
        "unlisted_scene",
      ]),
    );
  });

  it("목록에 없는 진입 장면과 없는 부모 엔티티를 진단한다", () => {
    const bundle = loadValidProjectBundle();
    bundle.project.entrySceneId = StableIdSchema.parse("scene.not-listed");
    bundle.scenes[0]!.entities[1]!.parentId =
      StableIdSchema.parse("entity.missing-parent");

    expect(collectIssueCodes(bundle)).toEqual(
      expect.arrayContaining([
        "entry_scene_not_listed",
        "missing_entry_scene",
        "missing_entity_reference",
      ]),
    );
  });

  it("유효한 부모 참조를 허용하고 순환 부모 참조는 진단한다", () => {
    const validParentBundle = loadValidProjectBundle();
    validParentBundle.scenes[0]!.entities[1]!.parentId =
      StableIdSchema.parse("entity.player");
    expect(collectIssueCodes(validParentBundle)).not.toContain(
      "cyclic_parent_reference",
    );

    const cyclicBundle = loadValidProjectBundle();
    cyclicBundle.scenes[0]!.entities[0]!.parentId =
      StableIdSchema.parse("entity.camera");
    cyclicBundle.scenes[0]!.entities[1]!.parentId =
      StableIdSchema.parse("entity.player");
    expect(collectIssueCodes(cyclicBundle)).toContain(
      "cyclic_parent_reference",
    );
  });
});
