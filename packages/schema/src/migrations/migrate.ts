export type DocumentKind =
  | "game-project"
  | "scene"
  | "entity"
  | "asset"
  | "module-manifest"
  | "ui-screen"
  | "module-binding";

export interface VersionedDocument {
  schemaVersion: number;
  [key: string]: unknown;
}

export interface MigrationStep {
  kind: DocumentKind;
  from: number;
  to: number;
  migrate(document: VersionedDocument): VersionedDocument;
}

const MIGRATIONS: readonly MigrationStep[] = [];

export class SchemaMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaMigrationError";
  }
}

/** 문서 kind별 schemaVersion을 최신으로 올린다. 현재는 v1 identity만 지원한다. */
export function migrateDocument(
  kind: DocumentKind,
  document: VersionedDocument,
  targetVersion = 1,
): VersionedDocument {
  if (!Number.isInteger(document.schemaVersion) || document.schemaVersion < 1) {
    throw new SchemaMigrationError("schemaVersion은 1 이상의 정수여야 합니다.");
  }
  if (document.schemaVersion > targetVersion) {
    throw new SchemaMigrationError(
      `${kind} schemaVersion ${document.schemaVersion}은 target ${targetVersion}보다 큽니다.`,
    );
  }

  let current = { ...document };
  while (current.schemaVersion < targetVersion) {
    const step = MIGRATIONS.find(
      (item) =>
        item.kind === kind && item.from === current.schemaVersion,
    );
    if (!step) {
      throw new SchemaMigrationError(
        `${kind} ${current.schemaVersion} → ${current.schemaVersion + 1} 마이그레이션이 없습니다.`,
      );
    }
    current = step.migrate(current);
    if (current.schemaVersion !== step.to) {
      throw new SchemaMigrationError(
        `${kind} 마이그레이션 결과가 기대 버전 ${step.to}가 아닙니다.`,
      );
    }
  }
  return current;
}

export function listMigrationSteps(): readonly MigrationStep[] {
  return MIGRATIONS;
}
