import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUESTS } from '../packages/content/quests';
import { GAME_ZONES } from '../packages/content/zones';
import { questZoneId, questBannerPath } from '../packages/content/questBanners';

/**
 * Every quest resolves to a real zone whose landscape file exists, so
 * the quest-detail banner never 404s. Bounty quests should resolve to
 * their boss's zone specifically.
 */
describe('quest banners', () => {
  const zoneIds = new Set(GAME_ZONES.map((z) => z.id));

  it('every quest resolves to a known zone with an existing landscape', () => {
    for (const [id, quest] of Object.entries(QUESTS)) {
      const zid = questZoneId(quest);
      expect(zoneIds.has(zid), `${id} → unknown zone ${zid}`).toBe(true);
      const file = join(process.cwd(), 'public', questBannerPath(quest));
      expect(existsSync(file), `${id} banner missing: ${questBannerPath(quest)}`).toBe(true);
    }
  });

  it('a kill-boss bounty resolves to that boss\'s zone', () => {
    // bounty_grakk → Grakk lives in the starter meadow.
    expect(questZoneId(QUESTS['bounty_grakk'])).toBe('starter_meadow');
  });
});
