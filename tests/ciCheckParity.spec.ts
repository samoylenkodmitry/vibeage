import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Asserts the GitHub Actions CI workflow runs every script that the
 * `pnpm run check` aggregate runs locally. Drift here is a P0 risk: a
 * green PR that wouldn't survive `pnpm run check` locally means a CI gap.
 *
 * Strategy: parse the `check` script from package.json, extract every
 * `pnpm run <sub>` (or `pnpm test`) it chains, and verify each one
 * appears in the workflow yaml as a `run:` step. We do textual matching
 * rather than yaml parsing to keep the test free of dev-deps and forgiving
 * of small formatting differences.
 */

const REPO_ROOT = path.resolve(__dirname, '..');

function extractCheckSubcommands(checkScript: string): string[] {
  return checkScript
    .split('&&')
    .map(s => s.trim())
    .filter(Boolean);
}

describe('CI ↔ pnpm run check parity', () => {
  it('every command chained inside `pnpm run check` is also a CI workflow step', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const check = pkg.scripts.check;
    expect(typeof check, 'package.json must define a "check" script').toBe('string');

    const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

    const subcommands = extractCheckSubcommands(check);
    expect(subcommands.length, 'parsed at least one subcommand from check').toBeGreaterThan(0);

    const missing: string[] = [];
    for (const cmd of subcommands) {
      if (!workflow.includes(`run: ${cmd}`)) {
        missing.push(cmd);
      }
    }

    expect(
      missing,
      `CI workflow is missing these \`pnpm run check\` subcommands: ${missing.join(', ')}. ` +
      'Add a matching `run: <cmd>` step to .github/workflows/ci.yml, or remove the command from the check script.',
    ).toEqual([]);
  });
});
