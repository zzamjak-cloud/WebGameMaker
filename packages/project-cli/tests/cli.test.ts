import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_DESIGN_SECTIONS,
  catalogSearch,
  collectDesignSectionIssues,
  createGameProject,
  createModuleScaffold,
  parseDesignFrontMatter,
  promoteGameFeature,
  validateDesignLibrary,
  validateProjectPath,
} from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("project-cli designs/catalog", () => {
  it("필수 10개 섹션과 front matter를 검증한다", async () => {
    const { designs, issues } = await validateDesignLibrary(
      join(repoRoot, "library/designs"),
    );
    expect(issues).toEqual([]);
    expect(designs.some((item) => item.frontMatter.id === "design.floodgate-07")).toBe(
      true,
    );
    expect(REQUIRED_DESIGN_SECTIONS).toHaveLength(10);

    const broken = collectDesignSectionIssues("## 1. 한 줄 목표와 대상 사용자\n");
    expect(broken.length).toBeGreaterThan(0);

    expect(() =>
      parseDesignFrontMatter(`---\nid: design.x\nextra: 1\n---\n`),
    ).toThrow(/허용되지 않은/);
  });

  it("design/module 검색과 게임 designId 참조를 통과한다", async () => {
    const designs = await catalogSearch({
      repoRoot,
      type: "design",
      tag: "harbor",
    });
    expect(designs.some((hit) => hit.id === "design.floodgate-07")).toBe(true);

    const modules = await catalogSearch({
      repoRoot,
      type: "module",
      text: "player-move",
    });
    expect(modules.some((hit) => hit.id === "module.player-move-2d")).toBe(true);

    const ok = await validateProjectPath(join(repoRoot, "games/floodgate-07"), {
      designsRoot: join(repoRoot, "library/designs"),
    });
    expect(ok.success).toBe(true);

    const missingDesignRoot = await mkdtemp(join(tmpdir(), "wgm-designs-"));
    await mkdir(join(missingDesignRoot, "empty"), { recursive: true });
    await writeFile(
      join(missingDesignRoot, "empty", "design.md"),
      `---\nid: design.other\ngenre: x\ntags: []\nstatus: draft\ntargetViewport:\n  width: 1\n  height: 1\nreferences: []\n---\n\n# t\n\n${REQUIRED_DESIGN_SECTIONS.map((section) => `## ${section}\n\n내용\n`).join("\n")}`,
    );
    const bad = await validateProjectPath(join(repoRoot, "games/floodgate-07"), {
      designsRoot: missingDesignRoot,
    });
    expect(bad.success).toBe(false);
  });

  it("game create로 골격과 design을 만든다", async () => {
    const root = await mkdtemp(join(tmpdir(), "wgm-create-"));
    await mkdir(join(root, "library/designs/_template"), { recursive: true });
    await writeFile(
      join(root, "library/designs/_template/design.md"),
      await (
        await import("node:fs/promises")
      ).readFile(join(repoRoot, "library/designs/_template/design.md"), "utf8"),
    );
    const created = await createGameProject({
      repoRoot: root,
      gameId: "game.phase3-demo",
      name: "Phase3 Demo",
    });
    expect(created.designId).toBe("design.phase3-demo");
  });

  it("module create/promote로 공용 모듈 후보 scaffold를 만든다", async () => {
    const root = await mkdtemp(join(tmpdir(), "wgm-module-"));
    const created = await createModuleScaffold({
      repoRoot: root,
      moduleId: "module.phase8-dash",
      category: "movement",
      capabilities: ["clock"],
    });
    expect(created.manifestPath).toBe(
      "packages/core-modules/manifests/phase8-dash.manifest.json",
    );
    const manifest = JSON.parse(await readFile(join(root, created.manifestPath), "utf8")) as {
      id: string;
      requiredCapabilities: string[];
    };
    expect(manifest.id).toBe("module.phase8-dash");
    expect(manifest.requiredCapabilities).toEqual(["clock"]);

    await mkdir(join(root, "games/demo/src/features"), { recursive: true });
    await writeFile(
      join(root, "games/demo/src/features/blink.ts"),
      "export const blink = 1;\n",
    );
    const promoted = await promoteGameFeature({
      repoRoot: root,
      sourcePath: "games/demo/src/features/blink.ts",
      moduleId: "module.phase8-blink",
      capabilities: ["eventBus"],
    });
    expect(await readFile(join(root, promoted.sourcePath), "utf8")).toContain("blink");
  });
});
