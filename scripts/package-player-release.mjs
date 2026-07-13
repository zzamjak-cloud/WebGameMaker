import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.join(repoRoot, 'exports/player-static');
const releasesRoot = path.join(repoRoot, 'releases/player-static');

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readReleaseId(commit) {
  const explicitId = process.env.WGM_RELEASE_ID?.trim();
  if (explicitId) {
    assert(
      /^[a-zA-Z0-9._-]+$/.test(explicitId),
      'WGM_RELEASE_ID는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.',
    );
    return explicitId;
  }
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `player-static-${date}-${commit}`;
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
  return {
    path: toPosix(path.relative(rootDir, absolutePath)),
    bytes: buffer.byteLength,
    sha256: `sha256:${sha256(buffer)}`,
  };
}

async function main() {
  const exportStats = existsSync(exportDir) ? await stat(exportDir) : null;
  assert(exportStats?.isDirectory(), 'exports/player-static가 없습니다. 먼저 pnpm verify:export를 실행해야 합니다.');

  const commit = gitValue(['rev-parse', '--short=12', 'HEAD'], 'unknown');
  const fullCommit = gitValue(['rev-parse', 'HEAD'], 'unknown');
  const releaseId = readReleaseId(commit);
  const releaseDir = path.join(releasesRoot, releaseId);
  const releaseExportDir = path.join(releaseDir, 'player-static');
  const archivePath = path.join(releaseDir, 'player-static.tar.gz');

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(releaseDir, { recursive: true });
  await cp(exportDir, releaseExportDir, { recursive: true });

  execFileSync('tar', ['-czf', archivePath, '-C', releaseDir, 'player-static'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const archiveRecord = await fileRecord(releaseDir, archivePath);
  const exportFiles = await listFiles(releaseExportDir);
  const fileRecords = [];
  for (const file of exportFiles) {
    fileRecords.push(await fileRecord(releaseDir, file));
  }

  const exportManifestPath = path.join(releaseExportDir, 'wgm-export-manifest.json');
  const exportManifestRecord = await fileRecord(releaseDir, exportManifestPath);
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const generatedAt = new Date().toISOString();
  const branch = gitValue(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown');
  const dirty = gitValue(['status', '--short'], '').length > 0;
  const totalBytes = fileRecords.reduce((sum, record) => sum + record.bytes, 0);

  const releaseManifest = {
    schemaVersion: 1,
    releaseId,
    app: '@web-game-maker/player',
    target: 'local-static-release',
    packageVersion: packageJson.version,
    generatedAt,
    source: {
      branch,
      commit: fullCommit,
      shortCommit: commit,
      dirty,
      remote: gitValue(['config', '--get', 'remote.origin.url'], 'local'),
    },
    export: {
      directory: 'player-static',
      manifest: exportManifestRecord,
      fileCount: fileRecords.length,
      totalBytes,
    },
    archive: archiveRecord,
    checksums: {
      file: 'SHA256SUMS',
      algorithm: 'sha256',
      entries: fileRecords.length + 1,
    },
    commands: {
      create: 'pnpm release:player',
      verify: 'pnpm verify:release',
      extract: 'tar -xzf player-static.tar.gz',
      serve:
        'node scripts/serve-static-export.mjs --dir <unpacked>/player-static --base /release/checkpoint/ --port 4273',
    },
  };

  const checksumLines = [archiveRecord, ...fileRecords].map((record) => {
    return `${record.sha256.replace('sha256:', '')}  ${record.path}`;
  });

  await writeFile(
    path.join(releaseDir, 'release-manifest.json'),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(path.join(releaseDir, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, 'utf8');

  console.log(
    `release packaged: ${path.relative(repoRoot, releaseDir)} (${fileRecords.length} files, ${archiveRecord.bytes} archive bytes)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
