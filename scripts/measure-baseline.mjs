import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { Client as ColyseusClient } from '@colyseus/sdk';

const root = process.cwd();
const serverPort = Number(process.env.BASELINE_SERVER_PORT ?? 3122);
const clientPort = Number(process.env.BASELINE_CLIENT_PORT ?? 5176);
const gameUrl = process.env.BASELINE_GAME_URL ?? `http://127.0.0.1:${serverPort}`;
const clientUrl = process.env.BASELINE_BROWSER_URL ?? `http://127.0.0.1:${clientPort}`;
const shouldStartLocal = process.env.BASELINE_START_LOCAL === '1';
const shouldSkipBrowserFps = process.env.BASELINE_SKIP_BROWSER_FPS === '1';
const shouldEnforceBudgets = process.env.BASELINE_ENFORCE === '1';
const budgetPath = process.env.BASELINE_BUDGETS ?? join(root, 'quality/performance-budgets.json');
const childProcesses = [];

try {
  if (shouldStartLocal) {
    await startLocalStack();
  }

  const report = {
    measuredAt: new Date().toISOString(),
    bundle: measureBundle(),
    tickCost: await measureTickCost(),
    roomLatency: await measureRoomLatency(gameUrl),
    browserFps: shouldSkipBrowserFps
      ? { available: false, reason: 'skipped by BASELINE_SKIP_BROWSER_FPS=1' }
      : await measureBrowserFps(),
  };
  report.budgets = evaluateBudgets(report, loadBudgets());

  console.log(JSON.stringify(report, null, 2));
  if (process.env.BASELINE_OUTPUT) {
    writeFileSync(process.env.BASELINE_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  }

  printBudgetSummary(report.budgets);
  if (shouldEnforceBudgets && report.budgets.failures.length > 0) {
    process.exitCode = 1;
  }
} finally {
  stopChildProcesses();
}

function measureBundle() {
  const distDir = join(root, 'apps/client/dist/assets');
  if (!existsSync(distDir)) {
    return { available: false, reason: 'run pnpm run build first' };
  }

  const assets = readdirSync(distDir)
    .filter((fileName) => fileName.endsWith('.js') || fileName.endsWith('.css'))
    .map((fileName) => {
      const body = readFileSync(join(distDir, fileName));
      return { fileName, bytes: body.length, gzipBytes: gzipSync(body).length };
    });

  return {
    available: true,
    assets,
    totalBytes: sum(assets, 'bytes'),
    totalGzipBytes: sum(assets, 'gzipBytes'),
  };
}

async function measureTickCost() {
  const output = await runCommand('pnpm', ['exec', 'tsx', 'scripts/measure-tick-cost.ts']);
  return JSON.parse(output);
}

async function measureRoomLatency(url) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const client = new ColyseusClient(toColyseusEndpoint(url), {
      headers: { Origin: new URL(clientUrl).origin },
    });
    let settled = false;
    let room;
    const timeout = setTimeout(() => {
      finish({ available: false, url, reason: 'timed out waiting for gameState' });
    }, 8_000);

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      Promise.resolve(room?.leave(true))
        .catch(() => undefined)
        .finally(() => resolve(result));
    }

    client.joinOrCreate('world', {
      playerName: `Baseline${Date.now()}`,
      clientProtocolVersion: 2,
    }).then((joinedRoom) => {
      room = joinedRoom;
      const connectedAt = performance.now();
      joinedRoom.onMessage('joinGame', () => undefined);
      joinedRoom.onMessage('msg', () => undefined);
      joinedRoom.onMessage('gameState', () => {
        const gameStateAt = performance.now();
        finish({
          available: true,
          url,
          connectMs: round(connectedAt - startedAt),
          gameStateRoundTripMs: round(gameStateAt - connectedAt),
        });
      });
      joinedRoom.send('requestGameState');
    }).catch((error) => {
      finish({
        available: false,
        url,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

function toColyseusEndpoint(url) {
  const endpoint = new URL(url);
  endpoint.pathname = '/colyseus';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

async function measureBrowserFps() {
  if (shouldSkipBrowserFps) {
    return { available: false, reason: 'skipped by BASELINE_SKIP_BROWSER_FPS=1' };
  }

  if (!shouldStartLocal && !process.env.BASELINE_BROWSER_URL) {
    return { available: false, reason: 'set BASELINE_START_LOCAL=1 or BASELINE_BROWSER_URL' };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(clientUrl);
    await enterWorld(page);
    await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().myPlayerId));
    return await evaluateWithRetry(page, sampleAnimationFrames);
  } catch (error) {
    return {
      available: false,
      url: clientUrl,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}

async function startLocalStack() {
  const gameServerUrl = `http://127.0.0.1:${serverPort}`;
  childProcesses.push(spawnCommand('pnpm', ['exec', 'tsx', 'apps/server/src/main.ts'], {
    PORT: String(serverPort),
    VIBEAGE_DISABLE_PERSISTENCE: '1',
    CORS_ORIGINS: `${clientUrl},http://localhost:${clientPort}`,
    WS_COMPRESSION: '0',
  }));
  await waitForHttp(`${gameServerUrl}/healthz`);

  childProcesses.push(spawnCommand('pnpm', [
    'exec',
    'vite',
    '--config',
    'apps/client/vite.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(clientPort),
    '--strictPort',
  ], { GAME_SERVER_PROXY_TARGET: gameServerUrl }));
  await waitForHttp(clientUrl);
}

async function enterWorld(page) {
  await page.getByLabel('Character Name').fill(`Baseline${Date.now()}`);
  await page.getByRole('button', { name: 'Enter the World' }).click();
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    return state?.connectionState === 'online'
      && Boolean(state.myPlayerId)
      && Boolean(state.lastKnownPlayerPosition)
      && state.enemyIds.length > 0;
  }, undefined, { timeout: 20_000 });
}

async function evaluateWithRetry(page, pageFunction) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.waitForTimeout(750);
      return await page.evaluate(pageFunction);
    } catch (error) {
      if (!String(error).includes('Execution context was destroyed')) {
        throw error;
      }

      lastError = error;
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().myPlayerId));
    }
  }

  throw lastError;
}

function sampleAnimationFrames() {
  const sampleCount = 180;
  const frameTimes = [];

  return new Promise((resolve) => {
    let previous = performance.now();
    function sample(now) {
      frameTimes.push(now - previous);
      previous = now;
      if (frameTimes.length >= sampleCount) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const averageFrameMs = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
        resolve({
          available: true,
          frames: frameTimes.length,
          averageFrameMs: Math.round(averageFrameMs * 1000) / 1000,
          averageFps: Math.round((1000 / averageFrameMs) * 10) / 10,
          p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 1000) / 1000,
        });
        return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

function loadBudgets() {
  if (!existsSync(budgetPath)) {
    return null;
  }

  return JSON.parse(readFileSync(budgetPath, 'utf8'));
}

function evaluateBudgets(report, budgets) {
  const warnings = [];
  const failures = [];
  const displayBudgetPath = budgetPath.startsWith(`${root}/`)
    ? budgetPath.slice(root.length + 1)
    : budgetPath;

  if (!budgets) {
    return { available: false, budgetPath: displayBudgetPath, warnings, failures };
  }

  collectAvailabilityIssues(failures, report, budgets);
  evaluateMaxBudget(warnings, failures, 'bundle.totalGzipBytes', report.bundle.totalGzipBytes, {
    warning: budgets.bundle?.warningTotalGzipBytes,
    failure: budgets.bundle?.maxTotalGzipBytes,
  });
  evaluateMaxBudget(warnings, failures, 'tickCost.averageTickMs', report.tickCost.averageTickMs, {
    warning: budgets.tickCost?.warningAverageTickMs,
    failure: budgets.tickCost?.maxAverageTickMs,
  });
  evaluateMaxBudget(warnings, failures, 'tickCost.spawnedEnemies', report.tickCost.spawnedEnemies, {
    warning: budgets.tickCost?.warningSpawnedEnemies,
    failure: budgets.tickCost?.maxSpawnedEnemies,
  });
  evaluateMaxBudget(warnings, failures, 'roomLatency.connectMs', report.roomLatency.connectMs, {
    warning: budgets.roomLatency?.warningConnectMs,
    failure: budgets.roomLatency?.maxConnectMs,
  });
  evaluateMaxBudget(warnings, failures, 'roomLatency.gameStateRoundTripMs', report.roomLatency.gameStateRoundTripMs, {
    warning: budgets.roomLatency?.warningGameStateRoundTripMs,
    failure: budgets.roomLatency?.maxGameStateRoundTripMs,
  });
  evaluateMinBudget(warnings, failures, 'browserFps.averageFps', report.browserFps.averageFps, {
    warning: budgets.browserFps?.warningAverageFps,
    failure: budgets.browserFps?.minAverageFps,
  });
  evaluateMaxBudget(warnings, failures, 'browserFps.p95FrameMs', report.browserFps.p95FrameMs, {
    warning: budgets.browserFps?.warningP95FrameMs,
    failure: budgets.browserFps?.maxP95FrameMs,
  });

  return { available: true, budgetPath: displayBudgetPath, warnings, failures };
}

function collectAvailabilityIssues(failures, report, budgets) {
  if (budgets.bundle && report.bundle.available === false) {
    failures.push(`bundle unavailable: ${report.bundle.reason ?? 'unknown reason'}`);
  }

  if (budgets.tickCost && typeof report.tickCost.averageTickMs !== 'number') {
    failures.push('tickCost.averageTickMs unavailable');
  }

  if (budgets.roomLatency && report.roomLatency.available === false) {
    failures.push(`roomLatency unavailable: ${report.roomLatency.reason ?? 'unknown reason'}`);
  }

  if (budgets.browserFps && !shouldSkipBrowserFps && report.browserFps.available === false) {
    failures.push(`browserFps unavailable: ${report.browserFps.reason ?? 'unknown reason'}`);
  }
}

function evaluateMaxBudget(warnings, failures, label, value, budget) {
  if (typeof value !== 'number') {
    return;
  }

  if (typeof budget.failure === 'number' && value > budget.failure) {
    failures.push(`${label} ${value} exceeds max ${budget.failure}`);
    return;
  }

  if (typeof budget.warning === 'number' && value > budget.warning) {
    warnings.push(`${label} ${value} exceeds warning ${budget.warning}`);
  }
}

function evaluateMinBudget(warnings, failures, label, value, budget) {
  if (typeof value !== 'number') {
    return;
  }

  if (typeof budget.failure === 'number' && value < budget.failure) {
    failures.push(`${label} ${value} is below min ${budget.failure}`);
    return;
  }

  if (typeof budget.warning === 'number' && value < budget.warning) {
    warnings.push(`${label} ${value} is below warning ${budget.warning}`);
  }
}

function printBudgetSummary(budgets) {
  if (!budgets.available) {
    console.error(`Performance budgets unavailable: ${budgets.budgetPath}`);
    return;
  }

  for (const warning of budgets.warnings) {
    console.error(`WARN: ${warning}`);
  }

  for (const failure of budgets.failures) {
    console.error(`FAIL: ${failure}`);
  }
}

function spawnCommand(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.unref();
  return child;
}

function stopChildProcesses() {
  for (const child of [...childProcesses].reverse()) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      continue;
    }

    try {
      stopChildProcess(child);
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        // Child already exited.
      }
    }
  }
}

function stopChildProcess(child) {
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.unref();
    return;
  }

  process.kill(-child.pid, 'SIGTERM');
}

async function waitForHttp(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runCommand(command, args) {
  const child = spawnCommand(command, args);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise((resolve) => child.once('close', resolve));
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${stderr}`);
  }
  return stdout.trim();
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
