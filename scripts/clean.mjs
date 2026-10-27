#!/usr/bin/env node
/**
 * Removes previous build output so stale, content-hashed assets from earlier
 * builds never leak into the bundle report or the deployed artifact.
 *
 * The removal is implemented manually because recursive `fs.rmSync` is a no-op
 * on some Windows/Node.js combinations.
 */
import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

function remove(target) {
  if (!existsSync(target)) {
    return;
  }

  if (!lstatSync(target).isDirectory()) {
    unlinkSync(target);
    return;
  }

  for (const entry of readdirSync(target)) {
    remove(join(target, entry));
  }

  rmdirSync(target);
}

for (const directory of ['dist', 'reports']) {
  remove(join(process.cwd(), directory));
}

console.log('Cleaned dist/ and reports/.');
