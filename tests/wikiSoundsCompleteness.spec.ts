import { describe, expect, it } from 'vitest';
import { ALL_SFX_URLS } from '../apps/client/src/audio/sampleMap';
import { SOUND_GROUPS, allCatalogCueIds, allCatalogSampleUrls } from '../apps/client/src/audio/soundCatalog';

/**
 * The wiki "Sounds" library must stay in lockstep with what the game actually
 * ships — adding a sample to the engine without surfacing it here (or vice
 * versa) is a bug. These guards mirror wikiMobsCompleteness for audio.
 */
describe('wiki sounds library completeness', () => {
  it('covers every shipped/preloaded sample, and references nothing extra', () => {
    const catalog = new Set(allCatalogSampleUrls());
    const shipped = new Set(ALL_SFX_URLS);
    for (const url of shipped) expect(catalog.has(url), `missing from Sounds library: ${url}`).toBe(true);
    for (const url of catalog) expect(shipped.has(url), `Sounds library references an unshipped file: ${url}`).toBe(true);
  });

  it('covers every synth cue', () => {
    const cues = new Set(allCatalogCueIds());
    const expected = [
      'hurt', 'hit', 'levelUp', 'pickup', 'kill', 'respawn',
      'death', 'lowHealth', 'lowMana', 'bossTelegraph', 'chat',
    ] as const;
    for (const cue of expected) expect(cues.has(cue), `missing cue: ${cue}`).toBe(true);
    expect(cues.size).toBe(expected.length);
  });

  it('gives every entry a stable id and at least one playable variant', () => {
    const ids = new Set<string>();
    for (const group of SOUND_GROUPS) {
      for (const entry of group.entries) {
        expect(entry.variants.length, `${entry.id} has no variants`).toBeGreaterThan(0);
        expect(ids.has(entry.id), `duplicate sound id: ${entry.id}`).toBe(false);
        ids.add(entry.id);
      }
    }
  });
});
