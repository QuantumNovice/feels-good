#!/usr/bin/env node
// Connects the app to a car. Reads the Pleos Connect virtual console (emulator port 8088, forwarded with adb) and
// streams the same gear, brake, speed, door and light signals the vehicle SDK gives the app. While the console isn't
// driving the emulator, a simulated car takes over, driven from the car control page the bridge serves or from the
// terminal keyboard. The web UI reads the stream directly and the debug app on the emulator reads it through
// `adb reverse tcp:5199`, so one control page drives both.
//
//   pnpm car                   emulator app + web UI, both driven by the control page
//   pnpm car --emulator        emulator app only          pnpm car --web     web UI only (no emulator)
//   pnpm car --automotive      use the Android Automotive 15 emulator instead of Pleos Connect 2.1 (or --avd <name>)
//   pnpm car --no-open         start without opening browser windows
//
// Keys: p r n d gear · w accelerate · s brake · ← → turn signal · h hazard · l headlights
//       1-4 doors (front left/right, rear left/right) · 5 trunk · q quit
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { adbPath, androidSdk, range, stopOwnServers } from './lib/tools.mjs';

const PORT = Number(process.env.CAR_BRIDGE_PORT || 5199);
const CONSOLE = process.env.CAR_CONSOLE_URL || 'http://127.0.0.1:8088';
const flag = (name) => process.argv.includes(name);
// --web and --emulator pick one side; with neither (or both) you get both. --no-ui and --no-emulator still work.
const both = flag('--web') === flag('--emulator');
const withUi = (both || flag('--web')) && !flag('--no-ui');
const withEmulator = (both || flag('--emulator')) && !flag('--no-emulator');
// --no-open keeps browser windows closed, for recordings and remote sessions.
const openPages = !process.argv.includes('--no-open');
const controlPage = readFileSync(new URL('./car-controls.html', import.meta.url));
const doorNames = { front_left: 'frontLeft', front_right: 'frontRight', rear_left: 'rearLeft', rear_right: 'rearRight' };
const keyDoors = { 1: 'frontLeft', 2: 'frontRight', 3: 'rearLeft', 4: 'rearRight', 5: 'trunk' };

// Simulated car used whenever the console has no active emulator connection.
const sim = { gear: 'park', speedKph: 0, accelerator: 0, brake: 0, turn: 'off', hazard: false, lowBeam: false, doors: {} };
let pedalTimer = { w: 0, s: 0 };
let source = 'keyboard';
let consoleNote = 'not reached yet';
let state = snapshot();
let lastSpeed = { kph: 0, at: Date.now() };
const clients = new Set();

function snapshot(from = sim) {
  return {
    driving: from.gear !== 'park',
    signals: {
      gear: from.gear,
      brake: from.brake > 0.05,
      brakeLevel: Math.round(from.brake * 100) / 100,
      turn: from.turn,
      hazard: from.hazard,
      lowBeam: from.lowBeam,
      speedKph: Math.round(from.speedKph * 10) / 10,
      acceleration: 0,
      doors: Object.fromEntries(Object.entries(from.doors).filter(([, open]) => open)),
    },
  };
}

function fromConsole(s) {
  const c = s.controls ?? {};
  const actual = String(s.gear?.actual?.value ?? s.gear?.actual ?? 'Park').toLowerCase();
  const doors = {};
  for (const [name, open] of Object.entries(s.body?.doors ?? {})) if (doorNames[name]) doors[doorNames[name]] = open;
  doors.trunk = !!s.body?.closures?.trunk;
  const turn = String(s.lights?.turn_signal_mode ?? 'Off').toLowerCase();
  return snapshot({
    gear: ['reverse', 'neutral', 'drive'].includes(actual) ? actual : 'park',
    speedKph: Number(c.speed_kph) || 0,
    brake: (Number(c.brake_pct) || 0) / 100,
    turn: turn === 'left' || turn === 'right' ? turn : 'off',
    hazard: !!s.lights?.hazard_on,
    lowBeam: !['off', 'auto'].includes(String(s.lights?.headlamp_mode ?? 'Off').toLowerCase()),
    doors,
  });
}

async function pollConsole() {
  try {
    const response = await fetch(`${CONSOLE}/vehicle/state`, { signal: AbortSignal.timeout(800) });
    const s = await response.json();
    if (s.controls?.emulator_active) {
      source = 'console';
      return fromConsole(s);
    }
    consoleNote = 'console reached, but it reports emulator_inactive';
  } catch {
    consoleNote = 'console not reachable';
  }
  source = 'keyboard';
  return undefined;
}

function stepSim(dt) {
  const now = Date.now();
  if (now > pedalTimer.w) sim.accelerator = 0;
  if (now > pedalTimer.s) sim.brake = 0;
  const direction = sim.gear === 'drive' ? 1 : sim.gear === 'reverse' ? 0.4 : 0;
  // m/s² → km/h per second: throttle pulls, brake and rolling drag slow the car.
  const accel = sim.accelerator * 3.2 * direction - sim.brake * 8 - (sim.speedKph > 0 ? 0.35 : 0);
  // Neutral coasts instead of stopping dead; reverse tops out at a walking-pace-like 64 km/h.
  sim.speedKph = Math.min(sim.gear === 'reverse' ? 64 : 160, Math.max(0, sim.speedKph + accel * 3.6 * dt));
  if (sim.gear === 'park') sim.speedKph = 0;
}

async function tick() {
  const fromCar = await pollConsole();
  if (!fromCar) stepSim(0.2);
  const next = fromCar ?? snapshot();
  const now = Date.now();
  const seconds = (now - lastSpeed.at) / 1000;
  next.signals.acceleration = seconds > 0 ? Math.round(((next.signals.speedKph - lastSpeed.kph) / 3.6 / seconds) * 100) / 100 : 0;
  lastSpeed = { kph: next.signals.speedKph, at: now };
  next.source = source;
  const json = JSON.stringify(next);
  if (json !== JSON.stringify(state)) for (const res of clients) res.write(`data: ${json}\n\n`);
  state = next;
  status();
}

function status() {
  if (!process.stdout.isTTY) return;
  const s = state.signals;
  const doors = Object.keys(s.doors).join(',') || 'closed';
  process.stdout.write(
    `\r\x1b[K[${source}] gear ${s.gear} · ${s.speedKph.toFixed(0)} km/h · brake ${Math.round(s.brakeLevel * 100)}% · ` +
      `turn ${s.hazard ? 'hazard' : s.turn} · lights ${s.lowBeam ? 'on' : 'off'} · doors ${doors} · UI clients ${clients.size}`,
  );
}

const localOrigin = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const server = createServer((req, res) => {
  const origin = req.headers.origin;
  // Other websites open in the same browser must not read or drive the car.
  if (origin && !localOrigin.test(origin)) {
    res.writeHead(403).end();
    return;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  // Scripted tests press the same keys: POST /key?k=d
  if (req.method === 'POST' && req.url?.startsWith('/key?')) {
    press(new URL(req.url, 'http://bridge').searchParams.get('k') ?? '');
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(controlPage);
    return;
  }
  if (req.url !== '/events') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify(state)}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
// Loopback only. The stream never leaves this machine, and a busy port (say, a second `pnpm car`) moves to the next one.
function listen(port, triesLeft = 10) {
  const onListening = () => {
    server.off('error', onError);
    started(port);
  };
  const onError = (error) => {
    server.off('listening', onListening);
    if (error.code !== 'EADDRINUSE' || triesLeft === 0) throw error;
    console.log(`Port ${port} is busy, trying ${port + 1}.`);
    listen(port + 1, triesLeft - 1);
  };
  server.once('listening', onListening);
  server.once('error', onError);
  server.listen(port, '127.0.0.1');
}
const sdk = androidSdk();
const adb = sdk ? adbPath(sdk) : process.platform === 'win32' ? 'adb.exe' : 'adb';
let bridgePort = PORT;
let launched;
// One emulator can be listed twice (emulator-5634 and its TCP serial 127.0.0.1:5635), so name a device explicitly.
// The console comes out to this machine on 8088, and the bridge goes in on 5199, where the debug app looks for it.
function connectEmulator() {
  const list = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout ?? '';
  const serials = [...list.matchAll(/^(\S+)\s+device$/gm)].map((m) => m[1]);
  const serial = serials.includes(launched) ? launched : (serials.find((s) => s.startsWith('emulator-')) ?? serials[0]);
  if (!serial) return false;
  spawnSync(adb, ['-s', serial, 'forward', 'tcp:8088', 'tcp:8088'], { stdio: 'ignore' });
  return spawnSync(adb, ['-s', serial, 'reverse', 'tcp:5199', `tcp:${bridgePort}`], { stdio: 'ignore' }).status === 0;
}

function openInBrowser(url) {
  const [command, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

// Opens the Pleos virtual console (the car's own drive, brake and gear controls) once it can drive the emulator.
async function openPleosConsole() {
  if (connectEmulator()) console.log('\nThe emulator app follows this car (adb reverse tcp:5199).');
  await pollConsole();
  const reachable = source === 'console' || consoleNote !== 'console not reachable';
  // The Pleos console shows the car on a 3D highway with traffic; open it whenever it answers.
  if (reachable) {
    console.log(`\nPleos virtual console: ${CONSOLE}`);
    if (openPages) openInBrowser(CONSOLE);
  }
  if (source !== 'console')
    console.log(`Using the simulated car (${consoleNote}). Drive it from the car control page or this terminal.`);
}

// Boots (or reuses) the Pleos emulator and installs the current app, without holding up the web UI.
function startEmulator() {
  console.log('Starting the Pleos emulator and installing the app (first build takes a few minutes)...');
  // Pass --avd <name> (or -Avd) through to the launcher.
  const avd = process.argv.findIndex((arg) => arg === '--avd' || arg === '-Avd');
  const args = avd > 0 && process.argv[avd + 1] ? ['--avd', process.argv[avd + 1]] : [];
  if (flag('--automotive')) args.push('--automotive');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./android.mjs', import.meta.url)), ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      // With two emulators running, connect adb to the one the launcher picked.
      launched = line.match(/^App launched on (\S+)\.$/)?.[1] ?? launched;
      console.log(`\r\x1b[K[emulator] ${line}`);
    }
  };
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('exit', (code) => {
    if (code === 0) void openPleosConsole();
    else console.log('[emulator] Not started. The web UI and simulated car keep working. See output/emulator-start.log.');
  });
}

function started(port) {
  bridgePort = port;
  connectEmulator();
  const controls = `http://127.0.0.1:${port}/`;
  console.log(`Car bridge on ${controls}events, reading ${CONSOLE}.`);
  console.log(`Car controls: ${controls}`);
  console.log('Keys: p r n d gear · w accelerate · s brake · ← → turn · h hazard · l lights · 1-5 doors/trunk · q quit');
  setInterval(tick, 200);
  if (openPages) openInBrowser(controls);
  if (withUi) startUi(port);
  if (withEmulator) startEmulator();
  else void openPleosConsole();
}
// Start clean: stop bridges and web UIs left over from an earlier run (the emulator is reused, not restarted).
stopOwnServers([...range(PORT, 11), ...(withUi ? range(5175, 11) : [])]);
listen(PORT);

if (process.stdin.isTTY) {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', (text, key = {}) => {
    const name = key.name ?? text;
    if (name === 'q' || (key.ctrl && name === 'c')) shutdown();
    else press(name);
  });
}

function press(name) {
    // Terminal key repeat stands in for holding a pedal; releasing it lets the pedal spring back.
    if (name === 'w') (sim.accelerator = Math.min(1, sim.accelerator + 0.25)), (pedalTimer.w = Date.now() + 600);
    else if (name === 's') (sim.brake = Math.min(1, sim.brake + 0.35)), (pedalTimer.s = Date.now() + 600);
    else if ({ p: 1, r: 1, n: 1, d: 1 }[name]) {
      if (name === 'p' && sim.speedKph > 3) return; // a real car refuses Park while rolling
      sim.gear = { p: 'park', r: 'reverse', n: 'neutral', d: 'drive' }[name];
    } else if (name === 'left' || name === 'right') sim.turn = sim.turn === name ? 'off' : name;
    else if (name === 'h') sim.hazard = !sim.hazard;
    else if (name === 'l') sim.lowBeam = !sim.lowBeam;
    else if (keyDoors[name]) sim.doors[keyDoors[name]] = !sim.doors[keyDoors[name]];
}

let ui;
function startUi(port) {
  // A fixed command string (no user input) keeps Windows' pnpm.cmd shim working without argument concatenation.
  ui = spawn(`pnpm --dir frontend dev --port 5175${openPages ? ' --open' : ''}`, {
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: true,
    detached: process.platform !== 'win32',
    env: { ...process.env, VITE_CAR_BRIDGE: `http://127.0.0.1:${port}/events` },
  });
  ui.stdout.on('data', (chunk) => {
    const url = String(chunk).replace(/\x1b\[[0-9;]*m/g, '').match(/Local:\s+(\S+)/)?.[1];
    if (url) console.log(`\nWeb UI: ${url}`);
  });
}

function shutdown() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  // The shell wrapper would exit and leave Vite running, so stop the whole process tree (the group on Linux and macOS).
  if (ui && process.platform === 'win32') spawnSync('taskkill', ['/pid', String(ui.pid), '/T', '/F'], { stdio: 'ignore' });
  else if (ui) {
    try {
      process.kill(-ui.pid);
    } catch {
      ui.kill();
    }
  }
  server.close();
  console.log('\nCar bridge stopped.');
  process.exit(0);
}
process.on('SIGINT', shutdown);
