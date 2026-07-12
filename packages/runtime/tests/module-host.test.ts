import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseProjectBundle } from "@web-game-maker/schema";
import { describe, expect, it } from "vitest";

import { createModuleHost } from "../src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("createModuleHost", () => {
  it("floodgate 장면의 공용 모듈 바인딩을 조립하고 정리한다", async () => {
    const project = JSON.parse(
      await readFile(
        resolve(repoRoot, "games/floodgate-07/game.project.json"),
        "utf8",
      ),
    ) as unknown;
    const scene = JSON.parse(
      await readFile(
        resolve(repoRoot, "games/floodgate-07/scenes/main.scene.json"),
        "utf8",
      ),
    ) as unknown;
    const bundle = parseProjectBundle({ project, scenes: [scene] });
    const host = createModuleHost(bundle, {
      knownGameModuleIds: new Set([
        "module.searchlight-pulse",
        "module.signal-beacon",
      ]),
    });

    expect(host.bindings.length).toBeGreaterThan(0);
    expect(
      host.bindings.every((binding) => host.registry.has(binding.moduleId)),
    ).toBe(true);

    host.start();
    host.update(16);
    host.destroy();
  });
});
