#!/usr/bin/env node
/**
 * Bundle size report with gzip/brotli sizes and a simple budget check.
 *
 * Usage:
 *   npm run build
 *   npm run analyze
 *
 * The JSON and Markdown reports are written to /reports so CI can upload
 * them as artifacts. The treemap (reports/bundle-stats.html) is produced by
 * rollup-plugin-visualizer when ANALYZE=true, i.e. by `npm run build:analyze`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = process.cwd();
const distDir = join(root, 'dist', 'spa');
const reportsDir = join(root, 'reports');

const budgets = {
  total: 450 * 1024,
  js: 350 * 1024,
  css: 80 * 1024,
  html: 20 * 1024,
  chunk: 250 * 1024,
};

const groups = [
  { name: 'JavaScript', extensions: ['.js', '.mjs'] },
  { name: 'CSS', extensions: ['.css'] },
  { name: 'HTML', extensions: ['.html'] },
  { name: 'Fonts', extensions: ['.woff', '.woff2', '.ttf', '.otf', '.eot'] },
  { name: 'Images', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico'] },
  { name: 'Other', extensions: ['.json', '.txt', '.xml', '.map', '.webmanifest'] },
];

if (!existsSync(distDir)) {
  console.error(`Bundle directory not found: ${relative(root, distDir)}`);
  console.error('Run "npm run build" first.');
  process.exit(1);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    return entry.isDirectory() ? walk(path) : [path];
  });
}

function groupOf(extension) {
  return groups.find((group) => group.extensions.includes(extension))?.name ?? 'Other';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const files = walk(distDir)
  .filter((path) => !path.endsWith('.map'))
  .map((path) => {
    const content = readFileSync(path);
    const extension = extname(path).toLowerCase();
    const gzip = gzipSync(content, { level: 9 }).length;
    const brotli = brotliCompressSync(content).length;

    return {
      file: relative(distDir, path).replaceAll('\\', '/'),
      group: groupOf(extension),
      raw: content.length,
      gzip,
      brotli,
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

const totals = files.reduce(
  (acc, file) => {
    acc.raw += file.raw;
    acc.gzip += file.gzip;
    acc.brotli += file.brotli;
    acc.byGroup[file.group] ??= { raw: 0, gzip: 0, brotli: 0, count: 0 };
    acc.byGroup[file.group].raw += file.raw;
    acc.byGroup[file.group].gzip += file.gzip;
    acc.byGroup[file.group].brotli += file.brotli;
    acc.byGroup[file.group].count += 1;
    return acc;
  },
  { raw: 0, gzip: 0, brotli: 0, byGroup: {} },
);

function groupTotals(name) {
  return totals.byGroup[name] ?? { raw: 0, gzip: 0, brotli: 0, count: 0 };
}

const compressed = groupTotals('JavaScript').gzip + groupTotals('CSS').gzip + groupTotals('HTML').gzip;
const jsChunks = files.filter((file) => file.group === 'JavaScript');
const largestChunk = jsChunks[0] ?? null;

const checks = [
  { label: 'JS + CSS + HTML (gzip)', actual: compressed, limit: budgets.total },
  { label: 'JavaScript (gzip)', actual: groupTotals('JavaScript').gzip, limit: budgets.js },
  { label: 'CSS (gzip)', actual: groupTotals('CSS').gzip, limit: budgets.css },
  { label: 'HTML (gzip)', actual: groupTotals('HTML').gzip, limit: budgets.html },
  { label: 'Largest JS chunk (gzip)', actual: largestChunk?.gzip ?? 0, limit: budgets.chunk },
];

const failures = checks.filter((check) => check.actual > check.limit);

mkdirSync(reportsDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  distDir: relative(root, distDir).replaceAll('\\', '/'),
  totals,
  budgets,
  checks: checks.map((check) => ({
    ...check,
    ok: check.actual <= check.limit,
  })),
  largestChunk,
  files,
};

writeFileSync(join(reportsDir, 'bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  '# Bundle report',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '| Group | Files | Raw | Gzip | Brotli |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...Object.entries(totals.byGroup).map(
    ([name, value]) =>
      `| ${name} | ${value.count} | ${formatBytes(value.raw)} | ${formatBytes(value.gzip)} | ${formatBytes(value.brotli)} |`,
  ),
  `| **Total** | **${files.length}** | **${formatBytes(totals.raw)}** | **${formatBytes(totals.gzip)}** | **${formatBytes(totals.brotli)}** |`,
  '',
  '## Budgets',
  '',
  '| Check | Actual | Limit | Status |',
  '| --- | ---: | ---: | --- |',
  ...checks.map(
    (check) =>
      `| ${check.label} | ${formatBytes(check.actual)} | ${formatBytes(check.limit)} | ${check.actual <= check.limit ? 'ok' : 'FAIL'} |`,
  ),
  '',
  '## Largest assets',
  '',
  '| File | Gzip | Brotli |',
  '| --- | ---: | ---: |',
  ...files.slice(0, 20).map((file) => `| ${file.file} | ${formatBytes(file.gzip)} | ${formatBytes(file.brotli)} |`),
  '',
].join('\n');

writeFileSync(join(reportsDir, 'bundle-report.md'), markdown);

console.log('\nBundle size report');
console.log('='.repeat(72));
console.log(
  ['File', 'Raw', 'Gzip', 'Brotli']
    .map((title, index) => title.padEnd([52, 10, 10, 10][index]))
    .join(''),
);

for (const file of files.slice(0, 25)) {
  console.log(
    [
      file.file.slice(0, 50).padEnd(52),
      formatBytes(file.raw).padStart(9),
      formatBytes(file.gzip).padStart(9),
      formatBytes(file.brotli).padStart(9),
    ].join(' '),
  );
}

console.log('-'.repeat(72));
console.log(
  `Total: raw ${formatBytes(totals.raw)}, gzip ${formatBytes(totals.gzip)}, brotli ${formatBytes(totals.brotli)}`,
);

for (const check of checks) {
  const status = check.actual <= check.limit ? 'ok' : 'FAIL';
  console.log(
    `${status === 'ok' ? '✔' : '✖'} ${check.label}: ${formatBytes(check.actual)} / ${formatBytes(check.limit)}`,
  );
}

console.log(`\nReports: ${relative(root, join(reportsDir, 'bundle-report.json'))}, ${relative(root, join(reportsDir, 'bundle-report.md'))}`);

if (failures.length > 0) {
  console.error(`\nBundle budget exceeded: ${failures.map((failure) => failure.label).join(', ')}`);
  process.exit(1);
}
