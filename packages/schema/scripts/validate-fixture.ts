import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { validateProjectBundle } from "../src/index.js";

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadProjectBundle(inputPath: string): Promise<unknown> {
  const inputStat = await stat(inputPath);
  if (inputStat.isFile()) {
    return readJson(inputPath);
  }

  const sceneDirectory = resolve(inputPath, "scenes");
  const sceneFiles = (await readdir(sceneDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".scene.json"))
    .map((entry) => entry.name)
    .sort();
  const scenes = await Promise.all(
    sceneFiles.map((fileName) => readJson(resolve(sceneDirectory, fileName))),
  );

  return {
    project: await readJson(resolve(inputPath, "game.project.json")),
    scenes,
  };
}

export async function validateProjectPath(inputPath: string) {
  return validateProjectBundle(await loadProjectBundle(resolve(inputPath)));
}
