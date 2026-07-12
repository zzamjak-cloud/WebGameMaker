import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export const REQUIRED_DESIGN_SECTIONS = [
  "1. 한 줄 목표와 대상 사용자",
  "2. 핵심 플레이 루프",
  "3. 입력과 조작",
  "4. 장면과 진행 구조",
  "5. 엔티티·규칙·승패 조건",
  "6. UI/HUD와 피드백",
  "7. 필요한 아트·오디오 목록",
  "8. 재사용할 기존 모듈·에셋",
  "9. 새로 구현할 기능과 공용화 후보",
  "10. 실행 가능한 인수 조건",
] as const;

export interface DesignFrontMatter {
  id: string;
  genre: string;
  tags: string[];
  status: string;
  targetViewport: { width: number; height: number };
  references: string[];
}

export interface DesignDocument {
  folder: string;
  path: string;
  frontMatter: DesignFrontMatter;
  body: string;
}

export interface DesignIssue {
  path: string;
  message: string;
}

export interface DesignCatalogEntry {
  id: string;
  genre: string;
  tags: string[];
  status: string;
  path: string;
}

const FRONT_MATTER_KEYS = new Set([
  "id",
  "genre",
  "tags",
  "status",
  "targetViewport",
  "references",
]);

function parseScalar(value: string): string | number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

/** 최소 YAML front matter 파서 (Phase 3 고정 필드만 지원) */
export function parseDesignFrontMatter(source: string): {
  frontMatter: DesignFrontMatter;
  body: string;
} {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    throw new Error("YAML front matter가 없습니다.");
  }
  const end = source.indexOf("\n---", 4);
  if (end < 0) {
    throw new Error("YAML front matter 종료 마커가 없습니다.");
  }
  const raw = source.slice(4, end).replace(/\r\n/g, "\n");
  const body = source.slice(end + 4).replace(/^\r?\n/, "");
  const lines = raw.split("\n");
  const data: Record<string, unknown> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`front matter 구문 오류: ${line}`);
    }
    const key = match[1]!;
    const rest = match[2]!;
    if (!FRONT_MATTER_KEYS.has(key)) {
      throw new Error(`허용되지 않은 front matter 키: ${key}`);
    }
    if (rest === "[]") {
      data[key] = [];
      index += 1;
      continue;
    }
    if (rest === "" || rest === "|" || rest === ">") {
      const items: unknown[] = [];
      let object: Record<string, unknown> | undefined;
      index += 1;
      while (index < lines.length) {
        const nested = lines[index] ?? "";
        if (!/^\s+/.test(nested) || nested.trim() === "") {
          break;
        }
        const list = /^\s+-\s+(.*)$/.exec(nested);
        if (list) {
          items.push(parseScalar(list[1]!));
          index += 1;
          continue;
        }
        const field = /^\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(nested);
        if (field) {
          object ??= {};
          object[field[1]!] = parseScalar(field[2]!);
          index += 1;
          continue;
        }
        throw new Error(`중첩 front matter 구문 오류: ${nested}`);
      }
      data[key] = object ?? items;
      continue;
    }
    data[key] = parseScalar(rest);
    index += 1;
  }

  const viewport = data.targetViewport;
  if (
    typeof viewport !== "object" ||
    viewport === null ||
    typeof (viewport as { width?: unknown }).width !== "number" ||
    typeof (viewport as { height?: unknown }).height !== "number"
  ) {
    throw new Error("targetViewport.width/height가 필요합니다.");
  }

  return {
    frontMatter: {
      id: String(data.id ?? ""),
      genre: String(data.genre ?? ""),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      status: String(data.status ?? ""),
      targetViewport: {
        width: (viewport as { width: number }).width,
        height: (viewport as { height: number }).height,
      },
      references: Array.isArray(data.references)
        ? data.references.map(String)
        : [],
    },
    body,
  };
}

export function collectDesignSectionIssues(body: string): string[] {
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((match) =>
    match[1]!.trim(),
  );
  const issues: string[] = [];
  for (const section of REQUIRED_DESIGN_SECTIONS) {
    if (!headings.includes(section)) {
      issues.push(`필수 섹션 누락: ${section}`);
    }
  }
  for (const heading of headings) {
    if (
      /^\d+\./.test(heading) &&
      !REQUIRED_DESIGN_SECTIONS.includes(
        heading as (typeof REQUIRED_DESIGN_SECTIONS)[number],
      )
    ) {
      issues.push(`알 수 없는 번호 섹션: ${heading}`);
    }
  }
  return issues;
}

export async function loadDesignDocument(
  filePath: string,
): Promise<DesignDocument> {
  const absolute = resolve(filePath);
  const source = await readFile(absolute, "utf8");
  const { frontMatter, body } = parseDesignFrontMatter(source);
  if (!frontMatter.id.startsWith("design.")) {
    throw new Error("design id는 design. 접두사가 필요합니다.");
  }
  return {
    folder: absolute,
    path: absolute,
    frontMatter,
    body,
  };
}

export async function validateDesignLibrary(
  designsRoot: string,
): Promise<{ designs: DesignDocument[]; issues: DesignIssue[] }> {
  const root = resolve(designsRoot);
  const designs: DesignDocument[] = [];
  const issues: DesignIssue[] = [];
  const folders = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "_template")
    .map((entry) => entry.name)
    .sort();

  for (const folder of folders) {
    const path = join(root, folder, "design.md");
    try {
      const document = await loadDesignDocument(path);
      designs.push(document);
      for (const message of collectDesignSectionIssues(document.body)) {
        issues.push({ path, message });
      }
      for (const key of ["id", "genre", "status"] as const) {
        if (!document.frontMatter[key]) {
          issues.push({ path, message: `${key}가 비어 있습니다.` });
        }
      }
    } catch (error) {
      issues.push({
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ids = new Map<string, string>();
  for (const design of designs) {
    const previous = ids.get(design.frontMatter.id);
    if (previous) {
      issues.push({
        path: design.path,
        message: `중복 design id: ${design.frontMatter.id} (${previous})`,
      });
    }
    ids.set(design.frontMatter.id, design.path);
  }

  return { designs, issues };
}

export function searchDesigns(
  designs: readonly DesignDocument[],
  query: { tag?: string; genre?: string; text?: string },
): DesignCatalogEntry[] {
  return designs
    .filter((design) => {
      if (query.tag && !design.frontMatter.tags.includes(query.tag)) {
        return false;
      }
      if (query.genre && design.frontMatter.genre !== query.genre) {
        return false;
      }
      if (query.text) {
        const haystack = `${design.frontMatter.id} ${design.body}`.toLowerCase();
        if (!haystack.includes(query.text.toLowerCase())) {
          return false;
        }
      }
      return true;
    })
    .map((design) => ({
      id: design.frontMatter.id,
      genre: design.frontMatter.genre,
      tags: design.frontMatter.tags,
      status: design.frontMatter.status,
      path: design.path,
    }));
}
