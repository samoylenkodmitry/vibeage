import { describe, expect, it } from 'vitest';
import { ALL_AUDIO_URLS } from '../apps/client/src/audio/sampleMap';
import { CUE_IDS, cueLayers } from '../apps/client/src/audio/cues';
import { SOUND_GROUPS, allCatalogCueIds, allCatalogSampleUrls } from '../apps/client/src/audio/soundCatalog';

/**
 * The wiki "Sounds" library must stay in lockstep with what the game actually
 * ships — shipping audio without surfacing it here (or referencing a file that
 * isn't shipped) is a bug. These guards mirror wikiMobsCompleteness for audio.
 */
describe('wiki sounds library completeness', () => {
  it('every shipped audio file is reachable from the library, and nothing extra', () => {
    // A file counts as covered if it's a play-chip in the catalog OR a clip a cue plays.
    const cueClipUrls = CUE_IDS.flatMap((cue) => cueLayers(cue).flatMap((layer) => layer.urls));
    const referenced = new Set<string>([...allCatalogSampleUrls(), ...cueClipUrls]);
    const shipped = new Set(ALL_AUDIO_URLS);
    for (const url of shipped) expect(referenced.has(url), `not in Sounds library: ${url}`).toBe(true);
    for (const url of referenced) expect(shipped.has(url), `library references an unshipped file: ${url}`).toBe(true);
  });

  it('covers every cue exactly', () => {
    const inCatalog = new Set(allCatalogCueIds());
    for (const cue of CUE_IDS) expect(inCatalog.has(cue), `missing cue: ${cue}`).toBe(true);
    expect(inCatalog.size).toBe(CUE_IDS.length);
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
