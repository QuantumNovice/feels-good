// Shared helpers for the pnpm commands so they behave the same on Windows, Linux and macOS.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const isWindows = platform() === 'win32';
const exe = (name) => (isWindows ? `${name}.exe` : name);

export function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

/** Processes listening on any of the TCP ports, with their command lines, found in one system call. */
function listeners(ports) {
  if (isWindows) {
    const script =
      `Get-NetTCPConnection -LocalPort ${ports.join(',')} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {` +
      ` $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"; "$($_.LocalPort)\`t$($p.ProcessId)\`t$($p.CommandLine)" }`;
    const out = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout ?? '';
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
      const [port, pid, ...cmd] = line.split('\t');
      return { port: Number(port), pid: Number(pid), cmd: cmd.join('\t') };
    });
  }
  const found = [];
  for (const port of ports)
    for (const pid of (spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).stdout ?? '').split(/\s+/))
      if (pid) found.push({ port, pid: Number(pid), cmd: spawnSync('ps', ['-o', 'args=', '-p', pid], { encoding: 'utf8' }).stdout ?? '' });
  return found;
}

/**
 * Stops earlier car bridges and web servers from this project that are still holding the given ports, so a new
 * `pnpm car` or `pnpm ui` starts clean. Anything that isn't ours (another app on the same port) is left alone.
 */
export function stopOwnServers(ports) {
  const here = root.replace(/\\/g, '/').toLowerCase();
  const seen = new Set([process.pid, process.ppid]);
  for (const { port, pid, cmd } of listeners(ports)) {
    const line = cmd.replace(/\\/g, '/').toLowerCase();
    if (seen.has(pid) || !pid || !(line.includes(here) || line.includes('car-bridge.mjs'))) continue;
    seen.add(pid);
    if (isWindows) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    console.log(`Stopped an earlier server on port ${port} (pid ${pid}).`);
  }
}

export const range = (from, count) => Array.from({ length: count }, (_, i) => from + i);

/** Runs a command in the repository root and stops on failure. */
export function run(command, args, { cwd = root, quiet = false } = {}) {
  // pnpm and gradlew.bat are .cmd/.bat shims on Windows, which need a shell to start.
  const shell = isWindows && /^(pnpm|.*gradlew\.bat)$/.test(command);
  // With a shell, pass one command line (the arguments here are fixed by these scripts, never user text).
  const result = spawnSync(shell ? [command, ...args].join(' ') : command, shell ? [] : args, {
    cwd,
    stdio: quiet ? 'pipe' : 'inherit',
    shell,
    encoding: 'utf8',
  });
  if (result.error) fail(`Could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  return result.stdout ?? '';
}

/** Like run, but returns null instead of stopping when the command fails. */
export function tryRun(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

export function androidSdk() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv) return fromEnv;
  const properties = join(root, 'local.properties');
  if (existsSync(properties)) {
    const line = readFileSync(properties, 'utf8').match(/^\s*sdk\.dir\s*=\s*(.+)$/m);
    if (line) return line[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
  }
  const defaults = isWindows
    ? [join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')]
    : [join(homedir(), 'Android', 'Sdk'), join(homedir(), 'Library', 'Android', 'sdk'), '/opt/android-sdk'];
  return defaults.find((path) => existsSync(path));
}

export const adbPath = (sdk) => join(sdk, 'platform-tools', exe('adb'));
export const emulatorPath = (sdk) => join(sdk, 'emulator', exe('emulator'));
// An explicit path: Windows may be set not to search the current folder for programs.
export const gradlew = () => (isWindows ? '.\\gradlew.bat' : './gradlew');

/** Uses Android Studio's bundled JDK when JAVA_HOME is not set. */
export function ensureJava() {
  if (process.env.JAVA_HOME) return;
  const candidates = isWindows
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')]
    : ['/opt/android-studio/jbr', join(homedir(), 'android-studio', 'jbr'), '/Applications/Android Studio.app/Contents/jbr/Contents/Home'];
  const jbr = candidates.find((path) => existsSync(path));
  if (jbr) process.env.JAVA_HOME = jbr;
}

export function appVersion() {
  const gradle = readFileSync(join(root, 'app', 'build.gradle.kts'), 'utf8');
  return gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1] ?? '0.0.0';
}

export function requireFrontendDependencies() {
  if (!existsSync(join(root, 'frontend', 'node_modules')))
    fail('Install dependencies first with pnpm install (or pnpm bootstrap).');
}
