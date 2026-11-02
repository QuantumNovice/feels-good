#!/usr/bin/env node
// pnpm build   builds the web UI and the debug APK
// pnpm test    runs the frontend and native unit tests
// pnpm dist    final build: tested APK, source zip and SHA-256 checksums in dist/
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appVersion, ensureJava, gradlew, requireFrontendDependencies, root, run } from './lib/tools.mjs';

const task = process.argv[2] ?? 'build';
ensureJava();
requireFrontendDependencies();

if (task === 'test') {
  run('pnpm', ['--dir', 'frontend', 'test']);
  run(gradlew(), ['testDebugUnitTest']);
  process.exit(0);
}

run('pnpm', ['--dir', 'frontend', 'build']);
if (task === 'dist') run('pnpm', ['--dir', 'frontend', 'test']);
run(gradlew(), task === 'dist' ? ['checkKotlinFormat', 'testDebugUnitTest', 'assembleDebug'] : ['assembleDebug']);
const apk = join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (task !== 'dist') {
  console.log(`\nAPK: ${apk}`);
  process.exit(0);
}

const version = appVersion();
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const files = [`neu-joh-${version}.apk`, `neu-joh-${version}-source.zip`];
copyFileSync(apk, join(dist, files[0]));
// Source = committed files only, minus internal notes listed in release-exclude.txt.
const excludes = readFileSync(join(root, 'scripts', 'release-exclude.txt'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => `:(exclude,glob)${line}`);
run('git', ['archive', '--format=zip', `--prefix=neu-joh-${version}/`, `--output=${join(dist, files[1])}`, 'HEAD', '--', '.', ...excludes]);
const sums = files.map((name) => `${createHash('sha256').update(readFileSync(join(dist, name))).digest('hex')}  ${name}`);
writeFileSync(join(dist, `neu-joh-${version}-SHA256SUMS.txt`), sums.join('\n') + '\n');
console.log(`\nFinal build in ${dist}:\n  ${files.join('\n  ')}\n  neu-joh-${version}-SHA256SUMS.txt`);
console.log('The source zip is built from the last commit, so commit your changes first.');
