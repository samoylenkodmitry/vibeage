import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { skillIdValues } from '../packages/protocol/common';

/**
 * The skillIdSchema Zod enum is the wire-boundary gate for CastReq
 * and LearnSkill. If a skill exists in the SKILLS catalog but NOT in
 * skillIdValues, every cast attempt for that skill is silently
 * rejected by safeParseClientMessage with `Invalid option: expected
 * one of ...`. The user can press the button forever and nothing
 * happens.
 *
 * This test caught a real prod incident where a new warrior could not
 * cast slash because slash wasn't in the enum — only mage skills
 * were. Lock the invariant so any new skill in SKILLS forces a
 * matching schema entry.
 */
describe('protocol skillId enum covers every SKILLS catalog entry', () => {
  it('every key in SKILLS is present in skillIdValues', () => {
    const catalogIds = Object.keys(SKILLS);
    const enumIds = new Set<string>(skillIdValues);
    const missing = catalogIds.filter((id) => !enumIds.has(id));
    expect(
      missing,
      `SKILLS catalog has ${missing.length} skill(s) not in skillIdValues — ` +
      `CastReq + LearnSkill for these will be silently rejected at the wire ` +
      `boundary. Add to skillIdValues in packages/protocol/common.ts: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every entry in skillIdValues is a real skill in SKILLS (no stale enum entries)', () => {
    const stale = skillIdValues.filter((id) => !SKILLS[id]);
    expect(
      stale,
      `skillIdValues contains ${stale.length} id(s) with no SKILLS entry: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
