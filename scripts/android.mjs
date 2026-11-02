#!/usr/bin/env node
// Builds the UI and debug APK, then installs and launches it on the Pleos emulator or a USB phone.
//
//   pnpm car --emulator [--avd <name>]  (through car-bridge.mjs)    pnpm device [--serial <adb-device-id>]
//
// The PowerShell spellings -Avd and -Serial still work.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import {
  adbPath,
  androidSdk,
  emulatorPath,
  ensureJava,
  fail,
  gradlew,
  isWindows,
  requireFrontendDependencies,
  root,
  run,
  tryRun,
} from './lib/tools.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.findIndex((a) => a.toLowerCase() === `--${name}` || a.toLowerCase() === `-${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.some((a) => /^-{1,2}(h|help)$/.test(a))) {
  console.log('Usage: pnpm car --emulator [--automotive | --avd <name>]\n       pnpm device [--serial <adb-device-id>]');
  console.log('Builds the UI and debug APK, then installs and launches on the emulator or a connected phone.');
  process.exit(0);
}
const device = args.includes('--device');
// --automotive picks the plain Android Automotive 15 emulator (no Pleos services) instead of Pleos Connect 2.1.
const avd = option('avd') ?? (args.includes('--automotive') ? 'Automotive_API_35' : 'Pleos_Connect_v2.1.0');
const wanted = option('serial');

const sdk = androidSdk();
if (!sdk) fail('Android SDK not found. Set ANDROID_HOME or sdk.dir in local.properties (pnpm bootstrap writes it).');
const adb = adbPath(sdk);
const emulator = emulatorPath(sdk);
for (const tool of device ? [adb] : [adb, emulator])
  if (!existsSync(tool)) fail(`Missing ${tool}. Install the Android SDK platform-tools and emulator.`);
ensureJava();
requireFrontendDependencies();

const adbDevices = () =>
  (tryRun(adb, ['devices']) ?? '')
    .split(/\r?\n/)
    .map((line) => line.match(/^(\S+)\s+device\s*$/)?.[1])
    .filter(Boolean);

let serial;
if (device) {
  const phones = adbDevices().filter((s) => !s.startsWith('emulator-'));
  if (wanted && !phones.includes(wanted))
    fail(`Device '${wanted}' is not connected and authorized. Check adb devices and accept the USB debugging prompt.`);
  if (!wanted && phones.length > 1)
    fail(`Multiple devices connected: ${phones.join(', ')}. Select one with pnpm device --serial <adb-device-id>.`);
  if (!wanted && !phones.length)
    fail('No authorized phone connected. Enable USB debugging, connect the phone and accept its prompt, then check adb devices.');
  serial = wanted ?? phones[0];
} else {
  const avds = (tryRun(emulator, ['-list-avds']) ?? '').split(/\r?\n/).filter(Boolean);
  if (!avds.includes(avd)) fail(`AVD '${avd}' is not installed. Available: ${avds.join(', ') || 'none'}`);
}

run('pnpm', ['--dir', 'frontend', 'build']);
run(gradlew(), ['assembleDebug']);

const findAvd = () =>
  adbDevices().find((s) => s.startsWith('emulator-') && (tryRun(adb, ['-s', s, 'emu', 'avd', 'name']) ?? '').includes(avd));

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer().once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });

// Windows NAT (Hyper-V, WSL, Docker) can reserve the default 5554-5585 range, which makes the emulator abort with
// "too many emulator instances". Pick an even console port whose adb port (console + 1) is free and not reserved.
async function freeEmulatorPort() {
  const reserved = isWindows
    ? [...(tryRun('netsh', ['int', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp']) ?? '').matchAll(/^\s*(\d+)\s+(\d+)/gm)].map(
        (m) => [Number(m[1]), Number(m[2])],
      )
    : [];
  for (let port = 5554; port <= 5682; port += 2) {
    const ok = [port, port + 1].every((p) => !reserved.some(([a, b]) => p >= a && p <= b));
    if (ok && (await portFree(port)) && (await portFree(port + 1))) return port;
  }
  fail('No free emulator port between 5554 and 5682.' + (isWindows ? ' Run "net stop winnat; net start winnat" as Administrator.' : ''));
}

if (!device) {
  serial = findAvd();
  let tcpSerial;
  let child;
  if (!serial) {
    const port = await freeEmulatorPort();
    // adb only discovers emulators on 5555-5585 by itself; connect over TCP above that.
    if (port > 5584) tcpSerial = `127.0.0.1:${port + 1}`;
    console.log(`Starting ${avd} on port ${port}...`);
    mkdirSync(join(root, 'output'), { recursive: true });
    const log = openSync(join(root, 'output', 'emulator-start.log'), 'w');
    child = spawn(emulator, ['-avd', avd, '-port', String(port)], { detached: true, stdio: ['ignore', log, log] });
    child.unref();
  }
  const deadline = Date.now() + 4 * 60_000;
  for (;;) {
    if (child && child.exitCode !== null) fail('Emulator exited early. See output/emulator-start.log.');
    if (!serial && tcpSerial) {
      tryRun(adb, ['connect', tcpSerial]);
      if (adbDevices().includes(tcpSerial)) serial = tcpSerial;
    }
    serial ??= findAvd();
    if (serial && (tryRun(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) ?? '').trim() === '1') break;
    if (Date.now() > deadline) fail('Emulator did not finish booting within four minutes. Check output/emulator-start.log.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Right after first boot the package manager can still be starting, so give the install a few tries.
const apk = join('app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
for (let attempt = 1; tryRun(adb, ['-s', serial, 'install', '-r', apk]) === null; attempt++) {
  if (attempt === 4) run(adb, ['-s', serial, 'install', '-r', apk]);
  console.log('Install not ready yet, retrying...');
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
run(adb, ['-s', serial, 'shell', 'am', 'start', '--user', 'current', '-n', 'com.brightideas.spotlane/.MainActivity']);
console.log(`App launched on ${serial}.`);

// Connect the Pleos virtual console (the 3D car view with gear, pedals and doors) to http://localhost:8088/.
// Only the Pleos image has it; plain Android Automotive follows the car control page alone.
if (!device && /pleos/i.test(avd) && tryRun(adb, ['-s', serial, 'forward', 'tcp:8088', 'tcp:8088']) !== null) {
  let state;
  for (let attempt = 0; attempt < 15 && !state; attempt++) {
    state = await fetch('http://127.0.0.1:8088/vehicle/state', { signal: AbortSignal.timeout(2000) })
      .then((response) => response.json())
      .catch(() => null);
    if (!state) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!state) console.log('The Pleos virtual console did not answer on port 8088.');
  else if (state.controls?.emulator_active) console.log('Pleos virtual console is live: http://localhost:8088/');
  else
    console.log(
      'Pleos virtual console: http://localhost:8088/ (inactive: the vehicle HAL is not ready, so gear and pedals are ignored)',
    );
}
