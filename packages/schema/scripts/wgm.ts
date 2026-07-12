import { resolve } from "node:path";

import { validateProjectPath } from "./validate-fixture.js";

function printUsage(): void {
  console.error("사용법: pnpm wgm validate <프로젝트 경로|bundle JSON 파일>");
}

async function main(): Promise<void> {
  const [command, inputPath, ...extraArguments] = process.argv.slice(2);

  if (
    command !== "validate" ||
    inputPath === undefined ||
    extraArguments.length > 0
  ) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const resolvedInputPath = resolve(process.cwd(), inputPath);
  const result = await validateProjectPath(resolvedInputPath);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "bundle";
      console.error(`${issuePath}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `프로젝트 검증 성공: ${result.data.project.id} (${result.data.scenes.length}개 장면)`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
