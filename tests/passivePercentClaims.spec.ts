import { describe, expect, it } from 'vitest';
import { SKILLS, type SkillId } from '../packages/content/skills';
import { PASSIVE_SKILL_CONTRIBUTIONS } from '../packages/content/classPassives';
import type { StatId } from '../packages/sim/statContributions';

// PR VV — when a passive's description claims "+N%" / "−N%" of a
// stat, the matching Contribution row must produce that magnitude
// numerically. Catches the "claims +25% but data says 1.0" class of
// bug (e.g. Lethal Focus initially shipped with description but no
// effect — this kind of test would have caught it).

const CLAIM_RE = /([+\-−])(\d+(?:\.\d+)?)%\s*([A-Za-z. /]+?)(?=[,.)]|$)/g;

// Keyword → stat id. Order matters — longer / compound keys (e.g.
// "MP regen") must be checked before their substrings ("mana").
const STAT_KEYS: ReadonlyArray<{ pattern: RegExp; stat: StatId }> = [
  { pattern: /\bmp\s*regen\b/i, stat: 'mpRegen' },
  { pattern: /\bhp\s*regen\b/i, stat: 'hpRegen' },
  { pattern: /\bphysical\s*attack\b|\bp\.?atk\b/i, stat: 'pAtk' },
  { pattern: /\bmagical\s*attack\b|\bm\.?atk\b/i, stat: 'mAtk' },
  { pattern: /\bphysical\s*defense\b|\bp\.?def\b/i, stat: 'pDef' },
  { pattern: /\bmagical\s*defense\b|\bm\.?def\b/i, stat: 'mDef' },
  { pattern: /\b(?:movement\s*)?speed\b/i, stat: 'runSpeed' },
  { pattern: /\bcrit(?:ical)?\s*chance\b/i, stat: 'critChance' },
  { pattern: /\bcrit(?:ical)?\s*damage\b/i, stat: 'critMult' },
  { pattern: /\bevasion\b/i, stat: 'evasion' },
  { pattern: /\baccuracy\b/i, stat: 'accuracy' },
  { pattern: /\b(?:maximum\s*)?hp\b|\bhealth\b/i, stat: 'maxHealth' },
  { pattern: /\b(?:maximum\s*)?mp\b|\bmana\b/i, stat: 'maxMana' },
  { pattern: /\bdamage\b|\bdmg\b/i, stat: 'dmgMult' },
];

function resolveStat(keyword: string): StatId | null {
  for (const { pattern, stat } of STAT_KEYS) {
    if (pattern.test(keyword)) return stat;
  }
  return null;
}

type ParsedClaim = { sign: 1 | -1; percent: number; stat: StatId; raw: string };

function parseClaims(description: string): ParsedClaim[] {
  const out: ParsedClaim[] = [];
  for (const match of description.matchAll(CLAIM_RE)) {
    const [, signCh, num, keyword] = match;
    const stat = resolveStat(keyword.trim());
    if (!stat) continue;
    out.push({
      sign: signCh === '+' ? 1 : -1,
      percent: Number(num),
      stat,
      raw: match[0],
    });
  }
  return out;
}

function expectedMulValue(sign: 1 | -1, percent: number): number {
  return 1 + sign * (percent / 100);
}

describe('passive skill descriptions reconcile with contribution magnitudes', () => {
  for (const [id, rows] of Object.entries(PASSIVE_SKILL_CONTRIBUTIONS) as Array<[SkillId, readonly { stat: StatId; op: string; value: number }[]]>) {
    const skill = SKILLS[id];
    if (!skill) continue;
    const claims = parseClaims(skill.description);
    if (claims.length === 0) continue;

    it(`${id} description reconciles with PASSIVE_SKILL_CONTRIBUTIONS`, () => {
      for (const claim of claims) {
        const matchingRow = rows.find((r) => r.stat === claim.stat);
        expect(
          matchingRow,
          `${id}: description claims "${claim.raw}" (stat ${claim.stat}) but no matching contribution row`,
        ).toBeDefined();
        if (!matchingRow) continue;

        if (matchingRow.op === 'mul') {
          const expected = expectedMulValue(claim.sign, claim.percent);
          expect(
            matchingRow.value,
            `${id}: description claims "${claim.raw}" (×${expected}) but row has value ${matchingRow.value}`,
          ).toBeCloseTo(expected, 4);
        } else if (matchingRow.op === 'addPre' || matchingRow.op === 'addPost') {
          const expected = claim.sign * (claim.percent / 100);
          expect(
            matchingRow.value,
            `${id}: description claims "${claim.raw}" (+${expected} flat) but row has value ${matchingRow.value}`,
          ).toBeCloseTo(expected, 4);
        }
      }
    });
  }
});
