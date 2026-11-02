#!/usr/bin/env node
// pnpm ui: stops an earlier web UI from this project, then starts a fresh one and opens it.
import { spawn } from 'node:child_process';
import { range, requireFrontendDependencies, stopOwnServers } from './lib/tools.mjs';

requireFrontendDependencies();
stopOwnServers(range(5175, 11));
const vite = spawn('pnpm --dir frontend dev --port 5175 --open', { stdio: 'inherit', shell: true });
vite.on('exit', (code) => process.exit(code ?? 0));
