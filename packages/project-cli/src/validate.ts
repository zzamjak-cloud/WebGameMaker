import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  validateProjectBundle,
  type ProjectBundle,
} from "@web-game-maker/schema";

import { validateDesignLibrary } from "./designs.js";

export type ProjectValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export type ProjectValidationResult =
  | { success: true; data: ProjectBundle }
  | { success: false; error: { issues: ProjectValidationIssue[] } };

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadProjectBundle(inputPath: string): Promise<unknown> {
  const absolute = resolve(inputPath);
  const inputStat = await stat(absolute);
  if (inputStat.isFile()) {
    return readJson(absolute);
  }

  const sceneDirectory = join(absolute, "scenes");
  const sceneFiles = (await readdir(sceneDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".scene.json"))
    .map((entry) => entry.name)
    .sort();
  const scenes = await Promise.all(
    sceneFiles.map((fileName) => readJson(join(sceneDirectory, fileName))),
  );

  return {
    project: await readJson(join(absolute, "game.project.json")),
    scenes,
  };
}

export async function validateProjectPath(
  inputPath: string,
  options?: { designsRoot?: string; requireDesign?: boolean },
): Promise<ProjectValidationResult> {
  const bundleResult = await validateProjectBundle(
    await loadProjectBundle(inputPath),
  );
  if (!bundleResult.success) {
    return {
      success: false,
      error: {
        issues: bundleResult.error.issues.map((issue) => ({
          path: issue.path.map((part) =>
            typeof part === "symbol" ? String(part) : part,
          ),
          message: issue.message,
        })),
      },
    };
  }

  const requireDesign = options?.requireDesign ?? true;
  if (!requireDesign) {
    return { success: true, data: bundleResult.data };
  }

  const designsRoot =
    options?.designsRoot ?? resolve(process.cwd(), "library/designs");
  const { designs, issues } = await validateDesignLibrary(designsRoot);
  if (issues.length > 0) {
    return {
      success: false,
      error: {
        issues: issues.map((issue) => ({
          path: [issue.path],
          message: issue.message,
        })),
      },
    };
  }

  const designId = bundleResult.data.project.designId;
  if (!designs.some((design) => design.frontMatter.id === designId)) {
    return {
      success: false,
      error: {
        issues: [
          {
            path: ["project", "designId"],
            message: `기획 문서를 찾을 수 없습니다: ${designId}`,
          },
        ],
      },
    };
  }

  return { success: true, data: bundleResult.data };
}
