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

/**
 * Reduce a chained subcommand to its canonical script name. We treat
 * `pnpm run <name>` and `pnpm <name>` as equivalent because pnpm itself
 * does (`pnpm test` and `pnpm run test` execute the same script).
 */
function canonicalScriptName(rawCmd: string): string | null {
  const normalized = rawCmd.trim().replace(/\s+/g, ' ');
  const runMatch = normalized.match(/^pnpm\s+run\s+([^\s]+)/);
  if (runMatch) return runMatch[1];
  const shortMatch = normalized.match(/^pnpm\s+([^\s]+)/);
  if (shortMatch) return shortMatch[1];
  return null;
}

function extractCheckScriptNames(checkScript: string): string[] {
  const names: string[] = [];
  for (const segment of checkScript.split('&&')) {
    const name = canonicalScriptName(segment);
    if (name) names.push(name);
  }
  return names;
}

function extractWorkflowScriptNames(workflowYaml: string): Set<string> {
  const names = new Set<string>();
  // Match `run: <cmd>` lines (any whitespace, optional trailing args). Multi-line
  // `run: |` blocks would need yaml parsing; CI today uses one-liners only, but
  // we include any `pnpm <name>` token anywhere in the file so future block
  // styles still match.
  const re = /pnpm\s+(?:run\s+)?([a-zA-Z0-9:_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(workflowYaml)) !== null) {
    names.add(match[1]);
  }
  return names;
}

describe('CI ↔ pnpm run check parity', () => {
  it('every command chained inside `pnpm run check` is also a CI workflow step', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const check = pkg.scripts.check;
    expect(typeof check, 'package.json must define a "check" script').toBe('string');

    const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

    const checkNames = extractCheckScriptNames(check);
    expect(checkNames.length, 'parsed at least one subcommand from check').toBeGreaterThan(0);

    const workflowNames = extractWorkflowScriptNames(workflow);

    const missing = checkNames.filter(name => !workflowNames.has(name));

    expect(
      missing,
      `CI workflow is missing these \`pnpm run check\` subcommands: ${missing.join(', ')}. ` +
      'Add a matching `run: pnpm run <name>` step to .github/workflows/ci.yml, or remove the command from the check script.',
    ).toEqual([]);
  });
});
