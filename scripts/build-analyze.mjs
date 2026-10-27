#!/usr/bin/env node
/**
 * Runs a production build with the bundle visualizer enabled.
 * The resulting treemap is written to reports/bundle-stats.html.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const quasarBin = join(process.cwd(), 'node_modules', '@quasar', 'app-vite', 'bin', 'quasar.js');
const result = spawnSync(process.execPath, [quasarBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ANALYZE: 'true',
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
