import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.join(repoRoot, 'exports/player-static');

const budgets = [
  { label: 'index.html', pattern: /^index\.html$/, gzipMax: 8 * 1024 },
  { label: 'entry css', pattern: /^assets\/.*\.css$/, gzipMax: 12 * 1024 },
  { label: 'entry js', pattern: /^assets\/index-[^/]+\.js$/, gzipMax: 90 * 1024 },
  {
    label: 'vertical runtime',
    pattern: /^assets\/verticalSliceRuntime-[^/]+\.js$/,
    gzipMax: 40 * 1024,
  },
  {
    label: 'phaser lifecycle',
    pattern: /^assets\/phaserLifecycle-[^/]+\.js$/,
    gzipMax: 380 * 1024,
  },
];
const totalGzipMax = 540 * 1024;

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(exportDir, relativePath), 'utf8'));
}

async function main() {
  const exportStats = existsSync(exportDir) ? await stat(exportDir) : null;
  assert(exportStats?.isDirectory(), 'exports/player-static가 없습니다.');

  const headers = await readFile(path.join(exportDir, '_headers'), 'utf8');
  for (const required of [
    "default-src 'self'",
    "script-src 'self'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: no-referrer',
  ]) {
    assert(headers.includes(required), `_headers에 ${required} 설정이 없습니다.`);
  }

  const exportManifest = await readJson('wgm-export-manifest.json');
  const assetManifest = await readJson('wgm-asset-manifest.json');
  const recoveryManifest = await readJson('wgm-recovery-manifest.json');
  assert(exportManifest.schemaVersion === 1, 'export manifest schemaVersion이 올바르지 않습니다.');
  assert(assetManifest.schemaVersion === 1, 'asset manifest schemaVersion이 올바르지 않습니다.');
  assert(recoveryManifest.schemaVersion === 1, 'recovery manifest schemaVersion이 올바르지 않습니다.');
  assert(assetManifest.assets?.length >= 4, 'asset manifest에 Phase 3 seed asset이 부족합니다.');

  for (const requiredFile of [
    'index.html',
    'studio-preview.html',
    'studio-preview.css',
    'studio-preview.js',
    '_headers',
  ]) {
    assert(existsSync(path.join(exportDir, requiredFile)), `${requiredFile} 파일이 없습니다.`);
  }

  const allFiles = await listFiles(exportDir);
  const recordsByPath = new Map(exportManifest.files.map((record) => [record.path, record]));
  for (const record of exportManifest.files) {
    const absolutePath = path.join(exportDir, record.path);
    const buffer = await readFile(absolutePath);
    assert(record.sha256 === `sha256:${sha256(buffer)}`, `${record.path} sha256이 불일치합니다.`);
    assert(record.gzipBytes === gzipSync(buffer).byteLength, `${record.path} gzipBytes가 불일치합니다.`);
  }

  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
  for (const file of htmlFiles) {
    const relativePath = toPosix(path.relative(exportDir, file));
    const html = await readFile(file, 'utf8');
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${relativePath}에 inline script가 있습니다.`);
    assert(!/(?:src|href)=["']https?:\/\//i.test(html), `${relativePath}에 외부 절대 URL이 있습니다.`);
  }

  const indexHtml = await readFile(path.join(exportDir, 'index.html'), 'utf8');
  assert(!indexHtml.includes('srcdoc'), 'index.html bundle에 srcdoc 문자열이 남아 있습니다.');
  assert(!indexHtml.includes('srcDoc'), 'index.html bundle에 srcDoc 문자열이 남아 있습니다.');

  let totalGzipBytes = 0;
  for (const file of allFiles) {
    const relativePath = toPosix(path.relative(exportDir, file));
    const buffer = await readFile(file);
    totalGzipBytes += gzipSync(buffer).byteLength;
    if (relativePath.endsWith('.js')) {
      const code = buffer.toString('utf8');
      assert(!code.includes('eval('), `${relativePath}에 eval 호출이 있습니다.`);
      assert(!code.includes('new Function'), `${relativePath}에 new Function 호출이 있습니다.`);
      assert(!code.includes('srcDoc'), `${relativePath}에 srcDoc 문자열이 남아 있습니다.`);
      assert(!code.includes('srcdoc'), `${relativePath}에 srcdoc 문자열이 남아 있습니다.`);
    }
  }
  assert(totalGzipBytes <= totalGzipMax, `전체 gzip 크기가 예산을 초과했습니다: ${totalGzipBytes}`);

  for (const budget of budgets) {
    const matches = [...recordsByPath.values()].filter((record) => budget.pattern.test(record.path));
    assert(matches.length > 0, `${budget.label} 예산 대상 파일을 찾지 못했습니다.`);
    for (const record of matches) {
      assert(
        record.gzipBytes <= budget.gzipMax,
        `${record.path} gzip ${record.gzipBytes} > ${budget.gzipMax}`,
      );
    }
  }

  console.log(`export verified: ${exportManifest.files.length} files, gzip ${totalGzipBytes} bytes`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
