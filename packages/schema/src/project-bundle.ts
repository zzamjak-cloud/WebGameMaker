import { z } from "zod";

import { GameProjectSchema } from "./game-project.js";
import { SceneSchema, type Scene } from "./scene.js";

export const ProjectBundleStructureSchema = z
  .strictObject({
    project: GameProjectSchema,
    scenes: z.array(SceneSchema),
  })
  .meta({
    title: "ProjectBundle",
    description: "프로젝트와 장면 파일을 함께 담는 영속 bundle 구조",
  });

export type ProjectBundle = z.infer<typeof ProjectBundleStructureSchema>;

export type ProjectBundleReferenceIssueCode =
  | "duplicate_project_scene_id"
  | "duplicate_scene_id"
  | "missing_project_scene"
  | "unlisted_scene"
  | "entry_scene_not_listed"
  | "missing_entry_scene"
  | "duplicate_entity_id"
  | "duplicate_module_binding_id"
  | "missing_entity_reference"
  | "cyclic_parent_reference";

export interface ProjectBundleReferenceIssue {
  code: ProjectBundleReferenceIssueCode;
  path: Array<string | number>;
  message: string;
}

function collectDuplicateIdIssues(
  bundle: ProjectBundle,
  issues: ProjectBundleReferenceIssue[],
): void {
  const sceneIds = new Map<string, number>();
  const entityIds = new Map<string, Array<string | number>>();
  const bindingIds = new Map<string, Array<string | number>>();

  bundle.scenes.forEach((scene, sceneIndex) => {
    const previousSceneIndex = sceneIds.get(scene.id);
    if (previousSceneIndex !== undefined) {
      issues.push({
        code: "duplicate_scene_id",
        path: ["scenes", sceneIndex, "id"],
        message: `중복된 장면 ID입니다: ${scene.id}`,
      });
    } else {
      sceneIds.set(scene.id, sceneIndex);
    }

    scene.entities.forEach((entity, entityIndex) => {
      const entityPath = ["scenes", sceneIndex, "entities", entityIndex, "id"];
      if (entityIds.has(entity.id)) {
        issues.push({
          code: "duplicate_entity_id",
          path: entityPath,
          message: `중복된 엔티티 ID입니다: ${entity.id}`,
        });
      } else {
        entityIds.set(entity.id, entityPath);
      }

      entity.modules.forEach((binding, bindingIndex) => {
        const bindingPath = [
          "scenes",
          sceneIndex,
          "entities",
          entityIndex,
          "modules",
          bindingIndex,
          "id",
        ];
        if (bindingIds.has(binding.id)) {
          issues.push({
            code: "duplicate_module_binding_id",
            path: bindingPath,
            message: `중복된 모듈 바인딩 ID입니다: ${binding.id}`,
          });
        } else {
          bindingIds.set(binding.id, bindingPath);
        }
      });
    });
  });
}

function collectSceneReferenceIssues(
  bundle: ProjectBundle,
  issues: ProjectBundleReferenceIssue[],
): void {
  const listedSceneIds = new Set<string>();

  bundle.project.sceneIds.forEach((sceneId, sceneIdIndex) => {
    if (listedSceneIds.has(sceneId)) {
      issues.push({
        code: "duplicate_project_scene_id",
        path: ["project", "sceneIds", sceneIdIndex],
        message: `프로젝트 장면 목록에 중복 ID가 있습니다: ${sceneId}`,
      });
    }
    listedSceneIds.add(sceneId);
  });

  const suppliedSceneIds = new Set(bundle.scenes.map((scene) => scene.id));

  bundle.project.sceneIds.forEach((sceneId, sceneIdIndex) => {
    if (!suppliedSceneIds.has(sceneId)) {
      issues.push({
        code: "missing_project_scene",
        path: ["project", "sceneIds", sceneIdIndex],
        message: `프로젝트가 참조한 장면을 bundle에서 찾을 수 없습니다: ${sceneId}`,
      });
    }
  });

  bundle.scenes.forEach((scene, sceneIndex) => {
    if (!listedSceneIds.has(scene.id)) {
      issues.push({
        code: "unlisted_scene",
        path: ["scenes", sceneIndex, "id"],
        message: `bundle 장면이 프로젝트 장면 목록에 없습니다: ${scene.id}`,
      });
    }
  });

  if (!listedSceneIds.has(bundle.project.entrySceneId)) {
    issues.push({
      code: "entry_scene_not_listed",
      path: ["project", "entrySceneId"],
      message: `진입 장면이 프로젝트 장면 목록에 없습니다: ${bundle.project.entrySceneId}`,
    });
  }

  if (!suppliedSceneIds.has(bundle.project.entrySceneId)) {
    issues.push({
      code: "missing_entry_scene",
      path: ["project", "entrySceneId"],
      message: `진입 장면을 bundle에서 찾을 수 없습니다: ${bundle.project.entrySceneId}`,
    });
  }
}

function collectEntityReferenceIssues(
  scene: Scene,
  sceneIndex: number,
  issues: ProjectBundleReferenceIssue[],
): void {
  const entityIndexById = new Map(
    scene.entities.map((entity, entityIndex) => [entity.id, entityIndex] as const),
  );

  scene.entities.forEach((entity, entityIndex) => {
    if (entity.parentId !== undefined && !entityIndexById.has(entity.parentId)) {
      issues.push({
        code: "missing_entity_reference",
        path: ["scenes", sceneIndex, "entities", entityIndex, "parentId"],
        message: `부모 엔티티를 같은 장면에서 찾을 수 없습니다: ${entity.parentId}`,
      });
    }

    entity.modules.forEach((binding, bindingIndex) => {
      if (
        binding.targetEntityId !== undefined &&
        !entityIndexById.has(binding.targetEntityId)
      ) {
        issues.push({
          code: "missing_entity_reference",
          path: [
            "scenes",
            sceneIndex,
            "entities",
            entityIndex,
            "modules",
            bindingIndex,
            "targetEntityId",
          ],
          message: `모듈 대상 엔티티를 같은 장면에서 찾을 수 없습니다: ${binding.targetEntityId}`,
        });
      }
    });
  });

  scene.entities.forEach((entity, entityIndex) => {
    const visitedEntityIds = new Set<string>();
    let currentEntity = entity;

    while (currentEntity.parentId !== undefined) {
      if (visitedEntityIds.has(currentEntity.id)) {
        issues.push({
          code: "cyclic_parent_reference",
          path: ["scenes", sceneIndex, "entities", entityIndex, "parentId"],
          message: `엔티티 부모 참조에 순환이 있습니다: ${entity.id}`,
        });
        break;
      }

      visitedEntityIds.add(currentEntity.id);
      const parentIndex = entityIndexById.get(currentEntity.parentId);
      if (parentIndex === undefined) {
        break;
      }
      currentEntity = scene.entities[parentIndex]!;
    }
  });
}

export function collectProjectBundleReferenceIssues(
  bundle: ProjectBundle,
): ProjectBundleReferenceIssue[] {
  const issues: ProjectBundleReferenceIssue[] = [];

  collectDuplicateIdIssues(bundle, issues);
  collectSceneReferenceIssues(bundle, issues);
  bundle.scenes.forEach((scene, sceneIndex) => {
    collectEntityReferenceIssues(scene, sceneIndex, issues);
  });

  return issues;
}

export const ProjectBundleSchema = ProjectBundleStructureSchema.superRefine(
  (bundle, context) => {
    for (const issue of collectProjectBundleReferenceIssues(bundle)) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
        params: { referenceIssueCode: issue.code },
      });
    }
  },
).meta({
  title: "ProjectBundle",
  description: "프로젝트와 장면 파일을 함께 검증하는 영속 bundle",
});

export function validateProjectBundle(input: unknown) {
  return ProjectBundleSchema.safeParse(input);
}

export function parseProjectBundle(input: unknown): ProjectBundle {
  return ProjectBundleSchema.parse(input);
}
