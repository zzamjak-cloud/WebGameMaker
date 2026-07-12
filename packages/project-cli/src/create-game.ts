import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface CreateGameOptions {
  repoRoot: string;
  gameId: string;
  templateId?: string;
  name?: string;
}

function toSlug(gameId: string): string {
  return gameId.replace(/^game\./, "");
}

export async function createGameProject(
  options: CreateGameOptions,
): Promise<{ gameDir: string; designId: string }> {
  const repoRoot = resolve(options.repoRoot);
  const slug = toSlug(options.gameId);
  if (!options.gameId.startsWith("game.")) {
    throw new Error("game id는 game. 접두사가 필요합니다.");
  }

  const gameDir = join(repoRoot, "games", slug);
  const scenesDir = join(gameDir, "scenes");
  await mkdir(scenesDir, { recursive: true });

  const designId = `design.${slug}`;
  const sceneId = `scene.${slug}-main`;
  const project = {
    schemaVersion: 1,
    id: options.gameId,
    name: options.name ?? slug,
    designId,
    viewport: { width: 1280, height: 720 },
    entrySceneId: sceneId,
    sceneIds: [sceneId],
  };
  const scene = {
    schemaVersion: 1,
    id: sceneId,
    name: "Main",
    type: "world",
    entities: [],
  };

  await writeFile(
    join(gameDir, "game.project.json"),
    `${JSON.stringify(project, null, 2)}\n`,
  );
  await writeFile(
    join(scenesDir, "main.scene.json"),
    `${JSON.stringify(scene, null, 2)}\n`,
  );

  const templatePath = join(repoRoot, "library/designs/_template/design.md");
  const template = await readFile(templatePath, "utf8");
  const designDir = join(repoRoot, "library/designs", slug);
  await mkdir(designDir, { recursive: true });
  const design = template
    .replace("id: design.example", `id: ${designId}`)
    .replace("references: []", `references:\n  - ${options.gameId}`);
  await writeFile(join(designDir, "design.md"), design);

  const packageJson = {
    name: `@web-game-maker/${slug}`,
    version: "0.0.0",
    private: true,
    type: "module",
  };
  await writeFile(
    join(gameDir, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );

  void options.templateId;
  return { gameDir, designId };
}
