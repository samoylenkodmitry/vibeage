import { describe, expect, it } from 'vitest';
import { CUE_IDS, cueLayers } from '../apps/client/src/audio/cues';
import { cueForCombatLineId, cueRateJitter, questCues } from '../apps/client/src/hud/eventCues';

/**
 * The event bridge classifies by combat-log id prefix, which is a contract with
 * clientVisualState.makeCombatLineId (`${prefix}:${ts}:${index}`). These guard
 * the two ways that silently breaks: a prefix collision (equipfail- vs equip-)
 * and a cue id that has no sample behind it.
 */
describe('hud event cues', () => {
  it('maps loot / equip / skill-learn log lines to their cue', () => {
    expect(cueForCombatLineId('loot-1700-Picked u:1700:3')).toBe('loot');
    expect(cueForCombatLineId('equip-weapon-iron_sword:1700:3')).toBe('equip');
    expect(cueForCombatLineId('learn-power_strike:1700:3')).toBe('learnSkill');
  });

  it('stays silent for lines that are not the local player gaining something', () => {
    // equipfail- must not read as equip-; pickup- is SOMEONE ELSE's loot.
    expect(cueForCombatLineId('equipfail-3-levelTooLow:1700:3')).toBeNull();
    expect(cueForCombatLineId('pickup-loot-42:1700:3')).toBeNull();
    expect(cueForCombatLineId('death-enemy-7:1700:3')).toBeNull();
  });

  it('fires accept on a new quest and stage on a stage that moved forward', () => {
    const prev = { a: { stageIndex: 0 }, b: { stageIndex: 2 } };
    expect(questCues(prev, prev)).toEqual([]);
    expect(questCues(prev, { ...prev, c: { stageIndex: 0 } })).toEqual(['questAccept']);
    expect(questCues(prev, { ...prev, a: { stageIndex: 1 } })).toEqual(['questStage']);
    // A quest leaving `active` is a completion — QuestCompleteBurst owns that sound.
    expect(questCues(prev, { a: { stageIndex: 0 } })).toEqual([]);
  });

  it('backs every event cue with real sample layers', () => {
    for (const cue of ['loot', 'equip', 'learnSkill', 'questAccept', 'questStage', 'bossEngage'] as const) {
      expect(CUE_IDS).toContain(cue);
      const layers = cueLayers(cue);
      expect(layers.length, `${cue} has no layers`).toBeGreaterThan(0);
      for (const layer of layers) expect(layer.urls.length, `${cue} layer has no clips`).toBeGreaterThan(0);
    }
  });

  it('jitters repeated cues within a narrow, always-positive window', () => {
    for (let i = 0; i < 50; i += 1) {
      const rate = cueRateJitter();
      expect(rate).toBeGreaterThan(0.93);
      expect(rate).toBeLessThan(1.07);
    }
  });
});
