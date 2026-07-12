import project from "../game.project.json";
import scene from "../scenes/main.scene.json";
import {
  compileProject,
  type FloodgateProjectConfig,
} from "../src/compileProject.js";

export function createBundle(): unknown {
  return structuredClone({
    project,
    scenes: [scene],
  });
}

export function getCompiledProject(): FloodgateProjectConfig {
  return compileProject(createBundle());
}
