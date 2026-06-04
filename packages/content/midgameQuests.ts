import type { QuestDef } from './quests.js';

export const MIDGAME_BEAT_QUESTS: Record<string, QuestDef> = {
  crystal_lattice_survey: {
    id: 'crystal_lattice_survey',
    name: 'Crystal Lattice Survey',
    description: 'Lenskeeper Savra wants a usable map of the caverns before the crystal lattice overgrows the old roads.',
    npcId: 'lenskeeper_savra',
    minLevel: 23,
    stages: [
      { id: 'take_lens_notes', description: 'Collect Savra\'s cracked survey lens.', objective: { kind: 'talk', npcId: 'lenskeeper_savra' } },
      { id: 'break_golem_anchors', description: 'Break 5 crystal golem anchors in the caverns.', objective: { kind: 'kill', enemyType: 'crystal_golem', count: 5 } },
      { id: 'scatter_elementals', description: 'Scatter 5 crystal elementals before they reform.', objective: { kind: 'kill', enemyType: 'crystal_elemental', count: 5 } },
      { id: 'trace_lattice', description: 'Trace the deepest visible lattice vein.', objective: { kind: 'reach', position: { x: -310, y: 0.5, z: -390 }, radius: 18 }, marker: { x: -310, y: 0.5, z: -390 } },
      { id: 'return_lens_notes', description: 'Return the annotated lens to Savra.', objective: { kind: 'talk', npcId: 'lenskeeper_savra' } },
    ],
    reward: { xp: 6200, gold: 1900, items: [{ itemId: 'crystal_shard', quantity: 8 }, { itemId: 'refraction_staff', quantity: 1 }] },
  },
  shadow_debt_ledger: {
    id: 'shadow_debt_ledger',
    name: 'Shadow Debt Ledger',
    description: 'Shade-Reeve Marn keeps a ledger of debts owed by the valley things that still know how to bargain.',
    npcId: 'shade_reeve_marn',
    minLevel: 25,
    stages: [
      { id: 'read_marns_terms', description: 'Hear Marn\'s terms at the valley marker.', objective: { kind: 'talk', npcId: 'shade_reeve_marn' } },
      { id: 'thin_shadowbeasts', description: 'Cut down 5 shadowbeasts from the dusk packs.', objective: { kind: 'kill', enemyType: 'shadowbeast', count: 5 } },
      { id: 'mark_darkstalkers', description: 'Mark 7 darkstalkers off Marn\'s ledger.', objective: { kind: 'kill', enemyType: 'darkstalker', count: 7 } },
      { id: 'close_shadow_debt', description: 'Return to Marn and close the debt line.', objective: { kind: 'talk', npcId: 'shade_reeve_marn' } },
    ],
    reward: { xp: 7200, gold: 2300, items: [{ itemId: 'void_crystal', quantity: 3 }, { itemId: 'dawnfeather_ring', quantity: 1 }] },
  },
  hourglass_field_notes: {
    id: 'hourglass_field_notes',
    name: 'Hourglass Field Notes',
    description: 'Hourglass Scribe Pelin needs live measurements from rifts that refuse to stay in one hour.',
    npcId: 'hourglass_scribe_pelin',
    minLevel: 29,
    stages: [
      { id: 'borrow_field_glass', description: 'Take Pelin\'s field glass and calibration marks.', objective: { kind: 'talk', npcId: 'hourglass_scribe_pelin' } },
      { id: 'disrupt_time_wraiths', description: 'Disrupt 6 time wraiths at the outer rifts.', objective: { kind: 'kill', enemyType: 'time_wraith', count: 6 } },
      { id: 'catch_chrono_stalkers', description: 'Catch 7 chrono stalkers between jumps.', objective: { kind: 'kill', enemyType: 'chrono_stalker', count: 7 } },
      { id: 'calibrate_rift_clock', description: 'Stand inside the stable rift long enough to calibrate the field glass.', objective: { kind: 'reach', position: { x: -700, y: 0.5, z: 720 }, radius: 18 }, marker: { x: -700, y: 0.5, z: 720 } },
      { id: 'file_field_notes', description: 'File the hourglass notes with Pelin.', objective: { kind: 'talk', npcId: 'hourglass_scribe_pelin' } },
    ],
    reward: { xp: 9000, gold: 2800, items: [{ itemId: 'temporal_fragment', quantity: 4 }, { itemId: 'temporal_shard', quantity: 3 }, { itemId: 'hourglass_pendant', quantity: 1 }] },
  },
};
