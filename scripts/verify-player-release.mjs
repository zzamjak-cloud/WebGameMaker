import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releasesRoot = path.join(repoRoot, 'releases/player-static');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} 값이 없습니다.`);
  }
  return value;
}

function resolvePath(input) {
  if (path.isAbsolute(input)) {
    return input;
  }
  return path.resolve(repoRoot, input);
}

function resolveReleasePath(releaseDir, relativePath) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'release manifest 경로가 비어 있습니다.');
  const normalizedPath = path.normalize(relativePath);
  assert(
    !path.isAbsolute(normalizedPath) && normalizedPath !== '..' && !normalizedPath.startsWith(`..${path.sep}`),
    `release 경로가 디렉터리 밖을 참조합니다: ${relativePath}`,
  );
  return path.join(releaseDir, normalizedPath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function fileSha256(filePath) {
  return `sha256:${sha256(await readFile(filePath))}`;
}

async function latestReleaseDir() {
  assert(existsSync(releasesRoot), '검증할 release 루트가 없습니다.');
  const entries = await readdir(releasesRoot, { withFileTypes: true });
  const directories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const absolutePath = path.join(releasesRoot, entry.name);
    const stats = await stat(absolutePath);
    directories.push({ absolutePath, mtimeMs: stats.mtimeMs });
  }
  assert(directories.length > 0, '검증할 release 디렉터리가 없습니다.');
  directories.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return directories[0].absolutePath;
}

async function verifyChecksums(releaseDir, expectedEntries) {
  const checksumText = await readFile(path.join(releaseDir, 'SHA256SUMS'), 'utf8');
  const lines = checksumText.split('\n').filter(Boolean);
  assert(lines.length > 0, 'SHA256SUMS가 비어 있습니다.');
  assert(lines.length === expectedEntries, `checksum 항목 수가 manifest와 다릅니다: ${lines.length}`);

  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
    assert(match, `checksum 형식이 올바르지 않습니다: ${line}`);
    const [, expectedHash, relativePath] = match;
    const absolutePath = resolveReleasePath(releaseDir, relativePath);
    assert(existsSync(absolutePath), `checksum 대상 파일이 없습니다: ${relativePath}`);
    const actualHash = sha256(await readFile(absolutePath));
    assert(actualHash === expectedHash, `checksum 불일치: ${relativePath}`);
  }
}

function verifyArchiveEntries(archivePath) {
  const listing = execFileSync('tar', ['-tzf', archivePath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const entries = listing.split('\n').filter(Boolean);
  assert(entries.length > 0, 'release archive가 비어 있습니다.');
  for (const entry of entries) {
    const normalizedPath = path.normalize(entry);
    assert(
      entry.startsWith('player-static/') &&
        !path.isAbsolute(normalizedPath) &&
        normalizedPath !== '..' &&
        !normalizedPath.startsWith(`..${path.sep}`),
      `archive entry가 허용 범위를 벗어납니다: ${entry}`,
    );
  }
}

async function main() {
  const requestedDir = readOption('--release-dir');
  const releaseDir = requestedDir ? resolvePath(requestedDir) : await latestReleaseDir();
  const releaseStats = existsSync(releaseDir) ? await stat(releaseDir) : null;
  assert(releaseStats?.isDirectory(), `release 디렉터리가 없습니다: ${releaseDir}`);

  const manifest = await readJson(path.join(releaseDir, 'release-manifest.json'));
  assert(manifest.schemaVersion === 1, 'release manifest schemaVersion이 올바르지 않습니다.');
  assert(manifest.target === 'local-static-release', 'release target이 올바르지 않습니다.');

  const archivePath = resolveReleasePath(releaseDir, manifest.archive.path);
  assert(existsSync(archivePath), 'release archive가 없습니다.');
  assert((await fileSha256(archivePath)) === manifest.archive.sha256, 'release archive sha256이 불일치합니다.');

  const exportManifestPath = resolveReleasePath(releaseDir, manifest.export.manifest.path);
  assert(existsSync(exportManifestPath), 'export manifest가 없습니다.');
  assert(
    (await fileSha256(exportManifestPath)) === manifest.export.manifest.sha256,
    'export manifest sha256이 불일치합니다.',
  );

  await verifyChecksums(releaseDir, manifest.checksums.entries);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wgm-release-'));
  try {
    verifyArchiveEntries(archivePath);
    execFileSync('tar', ['-xzf', archivePath, '-C', tempDir], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    const unpackedExportDir = path.join(tempDir, 'player-static');
    for (const requiredFile of [
      'index.html',
      '_headers',
      'wgm-export-manifest.json',
      'wgm-asset-manifest.json',
      'wgm-recovery-manifest.json',
    ]) {
      assert(existsSync(path.join(unpackedExportDir, requiredFile)), `archive에 ${requiredFile} 파일이 없습니다.`);
    }
    execFileSync(process.execPath, ['scripts/verify-export.mjs', '--dir', unpackedExportDir], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(`release verified: ${manifest.releaseId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
