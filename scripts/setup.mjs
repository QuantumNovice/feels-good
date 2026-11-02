#!/usr/bin/env node
// One-time setup check: reports missing tools, writes local.properties and installs frontend dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { androidSdk, ensureJava, fail, isWindows, root, run } from './lib/tools.mjs';

const problems = [];
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) problems.push(`Node.js 20+ is required (found ${process.versions.node}).`);

ensureJava();
const javaBin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', isWindows ? 'java.exe' : 'java') : 'java';
// java -version prints to stderr.
const java = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
const javaMajor = Number(`${java.stderr ?? ''}${java.stdout ?? ''}`.match(/version "(\d+)/)?.[1] ?? 0);
if (javaMajor < 17)
  problems.push(
    'JDK 17+ is required for Android builds. Set JAVA_HOME (Android Studio ships one in its jbr folder)' +
      (isWindows ? '.' : ', or install openjdk-17-jdk.'),
  );

const sdk = androidSdk();
if (!sdk) problems.push('Android SDK not found. Install it (Android Studio or cmdline-tools) and set ANDROID_HOME.');
else if (!existsSync(join(root, 'local.properties'))) {
  // Gradle reads the SDK path from here; backslashes and colons are escaped as Java properties require.
  writeFileSync(join(root, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
  console.log(`Wrote local.properties (sdk.dir=${sdk}).`);
}

if (!existsSync(join(root, 'frontend', 'node_modules'))) run('pnpm', ['--dir', 'frontend', 'install', '--frozen-lockfile']);

if (problems.length) fail(`Web UI is ready (pnpm ui). For Android builds, fix:\n- ${problems.join('\n- ')}`);
console.log('\nReady. Try pnpm ui, pnpm car, pnpm build or pnpm dist.');
