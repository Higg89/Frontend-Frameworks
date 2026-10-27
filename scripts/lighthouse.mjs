#!/usr/bin/env node
/**
 * Runs a Lighthouse audit against the production build.
 *
 * Requires Google Chrome (or Chromium) installed locally. Lighthouse is
 * downloaded on demand through npx, so this script is not part of the normal
 * build pipeline.
 *
 * Usage:
 *   npm run build
 *   npm run audit:lighthouse
 *
 * Reports are written to reports/lighthouse.report.html and .report.json.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const port = Number(process.env.LIGHTHOUSE_PORT ?? 4174);
const url = process.env.LIGHTHOUSE_URL ?? `http://localhost:${port}/`;
const mobile = process.argv.includes('--mobile');
const reportsDir = join(process.cwd(), 'reports');
const outputPath = join(reportsDir, mobile ? 'lighthouse-mobile' : 'lighthouse');

/** Chrome is not always on PATH, so common install locations are probed. */
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((candidate) => candidate !== undefined && candidate !== '');
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!existsSync(join(process.cwd(), 'dist', 'spa', 'index.html'))) {
  console.error('dist/spa/index.html not found. Run "npm run build" first.');
  process.exit(1);
}

mkdirSync(reportsDir, { recursive: true });

const server = spawn(process.execPath, ['scripts/preview.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
  },
});

async function waitForServer(timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });

      if (response.ok) {
        return true;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

function stopServer() {
  if (!server.killed) {
    server.kill();
  }
}

let exitCode = 1;

try {
  if (!(await waitForServer())) {
    console.error(`Preview server did not start at ${url}`);
    process.exitCode = 1;
  } else {
    // Run the npx CLI through Node directly: spawning `npx.cmd` needs a shell on
    // Windows, and shell argument concatenation breaks paths with spaces.
    const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    const useNodeCli = existsSync(npxCli);
    const command = useNodeCli
      ? process.execPath
      : process.platform === 'win32'
        ? 'npx.cmd'
        : 'npx';
    const args = [
      ...(useNodeCli ? [npxCli] : []),
      '--yes',
      'lighthouse@12',
      url,
      ...(mobile ? [] : ['--preset=desktop']),
      '--output=json',
      '--output=html',
      `--output-path=${outputPath}`,
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
      '--quiet',
    ];

    const result = spawnSync(command, args, {
      stdio: 'inherit',
      shell: !useNodeCli && process.platform === 'win32',
      env: { ...process.env, ...(chromePath ? { CHROME_PATH: chromePath } : {}) },
    });

    const jsonPath = `${outputPath}.report.json`;

    if (result.status !== 0 || !existsSync(jsonPath)) {
      if (result.error) {
        console.error(result.error);
      }
      console.error(
        `Lighthouse exited with code ${result.status ?? 'null'}. Install Chrome and run the command again.`,
      );
    } else {
      const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const scores = Object.fromEntries(
        Object.entries(report.categories).map(([key, category]) => [
          key,
          Math.round((category.score ?? 0) * 100),
        ]),
      );

      console.log('\nLighthouse scores');
      for (const [category, score] of Object.entries(scores)) {
        console.log(`  ${category}: ${score}`);
      }

      exitCode = scores.performance >= 90 ? 0 : 1;

      if (exitCode !== 0) {
        console.error('\nPerformance score is below the required 90.');
      }
    }
  }
} finally {
  stopServer();
}

process.exit(exitCode);
