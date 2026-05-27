#!/usr/bin/env node
/**
 * Engine-abstraction gate (docs/ENGINE_ABSTRACTION.md).
 *
 * Scans the engine (combat / AI / players / movement / enemies / the
 * sim core) for the anti-patterns the spec-driven rewrite removes, and
 * reports how much "old code" remains. The target is ZERO; while the
 * rewrite is in flight this runs ADVISORY (always exit 0, just print
 * the count). Flip ADVISORY=false in the B5 sweep to make it block CI.
 *
 *   Date.now() / Math.random()  → time & RNG must be injected (Clock/Rng)
 *   ?? <number>                 → a baseline standing in for spec data
 *   as PlayerState / as Enemy   → type-test instead of reading a characteristic
 *
 * Run: node scripts/check-engine-abstraction.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ADVISORY = true; // B5 sweep flips this to false (enforcing).

const ROOTS = [
  'server/combat', 'server/ai', 'server/players', 'server/movement', 'server/enemies', 'server/sim',
  'packages/sim',
];

// `enforced` rules must reach 0 (they're unambiguously old-code). The
// `?? <number>` baseline scan is advisory only — a directional signal
// toward spec-sourced characteristics; idiomatic `?? 0` guards mean a
// literal 0 isn't a sane enforce target, so it never blocks.
const RULES = [
  { id: 'wall-clock', enforced: true, re: /\bDate\.now\s*\(/g, msg: 'Date.now() — inject a Clock' },
  { id: 'rng', enforced: true, re: /\bMath\.random\s*\(/g, msg: 'Math.random() — inject an Rng' },
  { id: 'type-cast', enforced: true, re: /\bas\s+(PlayerState|Enemy)\b/g, msg: 'as PlayerState/Enemy — read a characteristic, don\'t type-test' },
  { id: 'baseline-default', enforced: false, re: /\?\?\s*-?\d/g, msg: '?? <number> — characteristic should come from the spec (advisory)' },
];

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r, []));
const violations = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return; // skip comments
      const matches = line.match(rule.re);
      if (matches) violations.push({ file, line: i + 1, rule: rule.id, msg: rule.msg, count: matches.length });
    });
  }
}

const enforcedIds = new Set(RULES.filter((r) => r.enforced).map((r) => r.id));
const countFor = (id) => violations.filter((v) => v.rule === id).reduce((n, v) => n + v.count, 0);
const enforcedTotal = [...enforcedIds].reduce((n, id) => n + countFor(id), 0);
const byRule = RULES.map((r) => `${r.id}=${countFor(r.id)}${r.enforced ? '' : '*'}`).join('  ');

console.log(`Engine-abstraction gate — ${files.length} engine files scanned`);
console.log(`Enforced old-code remaining: ${enforcedTotal}   (${byRule})   (* = advisory only)`);
console.log(`Target: 0 enforced. Mode: ${ADVISORY ? 'ADVISORY (non-blocking)' : 'ENFORCING'}.`);
if (process.argv.includes('--list')) {
  for (const v of violations) console.log(`  ${v.file}:${v.line}  [${v.rule}] ${v.msg}`);
}

if (!ADVISORY && enforcedTotal > 0) {
  console.error(`\nFAIL: ${enforcedTotal} enforced engine-abstraction violations remain (run with --list).`);
  process.exit(1);
}
