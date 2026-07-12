import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'apps/player/dist');
const exportDir = path.join(repoRoot, 'exports/player-static');
const assetCatalogPath = path.join(repoRoot, 'library/catalogs/assets.catalog.json');

const headerText = `/*
  Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; child-src 'self'; frame-src 'self'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
`;

function gitValue(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

async function listFiles(rootDir) {
  const results = [];
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }
  await walk(rootDir);
  return results.sort((left, right) => left.localeCompare(right));
}

async function fileRecord(rootDir, absolutePath) {
  const buffer = await readFile(absolutePath);
  const relativePath = toPosix(path.relative(rootDir, absolutePath));
  return {
    path: relativePath,
    bytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer).byteLength,
    sha256: `sha256:${sha256(buffer)}`,
  };
}

async function buildAssetManifest() {
  const catalog = JSON.parse(await readFile(assetCatalogPath, 'utf8'));
  const assetRecords = [];
  for (const asset of catalog.assets ?? []) {
    const assetRoot = path.join(repoRoot, 'library', asset.path);
    if (!existsSync(assetRoot)) {
      continue;
    }
    const files = await listFiles(assetRoot);
    const sourceFiles = [];
    for (const file of files) {
      sourceFiles.push(await fileRecord(path.join(repoRoot, 'library'), file));
    }
    assetRecords.push({
      ...asset,
      sourceFiles,
    });
  }
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/export-player.mjs',
    catalogPath: 'library/catalogs/assets.catalog.json',
    catalogSha256: `sha256:${sha256(await readFile(assetCatalogPath))}`,
    assets: assetRecords,
  };
}

async function main() {
  const sourceStats = existsSync(sourceDir) ? await stat(sourceDir) : null;
  if (!sourceStats?.isDirectory()) {
    throw new Error('apps/player/dist가 없습니다. 먼저 player build를 실행해야 합니다.');
  }

  await rm(exportDir, { recursive: true, force: true });
  await mkdir(exportDir, { recursive: true });
  await cp(sourceDir, exportDir, { recursive: true });

  const commit = gitValue(['rev-parse', '--short=12', 'HEAD'], 'unknown');
  const branch = gitValue(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown');
  const generatedAt = new Date().toISOString();

  await writeFile(path.join(exportDir, '_headers'), headerText, 'utf8');

  const contentFiles = (await listFiles(exportDir))
    .map((file) => toPosix(path.relative(exportDir, file)))
    .filter((file) => !file.startsWith('wgm-'));

  const fileRecords = [];
  for (const relativePath of contentFiles) {
    fileRecords.push(await fileRecord(exportDir, path.join(exportDir, relativePath)));
  }

  const assetManifest = await buildAssetManifest();
  const exportManifest = {
    schemaVersion: 1,
    exportId: `player-static-${commit}`,
    app: '@web-game-maker/player',
    target: 'local-static',
    generatedAt,
    source: {
      branch,
      commit,
      buildCommand: 'pnpm --filter @web-game-maker/player build',
      exportCommand: 'pnpm export:player',
    },
    base: './',
    routes: [
      { path: './', label: 'topdown-action vertical slice' },
      { path: './?view=studio', label: 'studio editor' },
      { path: './?view=compat', label: 'phaser compatibility bench' },
      { path: './studio-preview.html', label: 'sandboxed studio preview' },
    ],
    securityHeadersFile: '_headers',
    files: fileRecords,
  };
  const recoveryManifest = {
    schemaVersion: 1,
    generatedBy: 'scripts/export-player.mjs',
    generatedAt,
    source: {
      branch,
      commit,
      repository: gitValue(['config', '--get', 'remote.origin.url'], 'local'),
    },
    restore: {
      commands: [
        'pnpm install',
        'pnpm --filter @web-game-maker/player build',
        'pnpm export:player',
        'pnpm verify:export',
      ],
      exportDirectory: 'exports/player-static',
      localStoragePrefixes: ['wgm.phase5.studio.'],
    },
    manifests: [
      'wgm-export-manifest.json',
      'wgm-asset-manifest.json',
      'wgm-recovery-manifest.json',
    ],
  };

  await writeFile(
    path.join(exportDir, 'wgm-export-manifest.json'),
    `${JSON.stringify(exportManifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(exportDir, 'wgm-asset-manifest.json'),
    `${JSON.stringify(assetManifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(exportDir, 'wgm-recovery-manifest.json'),
    `${JSON.stringify(recoveryManifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`exported ${fileRecords.length} files to ${path.relative(repoRoot, exportDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
