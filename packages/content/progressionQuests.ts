import type { QuestDef } from './quests.js';

export const HIGH_PROGRESSION_QUESTS: Record<string, QuestDef> = {
  sunspire_firebreak: {
    id: 'sunspire_firebreak',
    name: 'Sunspire Firebreak',
    description: 'Firebreak Warden Iyen needs a clean patrol line before the steppe fires join into one moving wall.',
    npcId: 'firebreak_warden_iyen',
    minLevel: 31,
    stages: [
      { id: 'take_firebreak_marks', description: 'Take Iyen\'s firebreak marks at the Sunspire road camp.', objective: { kind: 'talk', npcId: 'firebreak_warden_iyen' } },
      { id: 'drop_cinder_sentinels', description: 'Break 5 cinder sentinels along the hot road.', objective: { kind: 'kill', enemyType: 'cinder_sentinel', count: 5 } },
      { id: 'turn_sunscale_drakes', description: 'Drive off 4 sunscale drakes before they reignite the line.', objective: { kind: 'kill', enemyType: 'sunscale_drake', count: 4 } },
      { id: 'seal_the_cutline', description: 'Stand at the cutline marker and set the final ward.', objective: { kind: 'reach', position: { x: 258_800, y: 0.5, z: -119_200 }, radius: 24 }, marker: { x: 258_800, y: 0.5, z: -119_200 } },
      { id: 'report_firebreak', description: 'Return to Iyen with the heat readings.', objective: { kind: 'talk', npcId: 'firebreak_warden_iyen' } },
    ],
    reward: { xp: 260_000, gold: 5_200, items: [{ itemId: 'firebreak_sash', quantity: 1 }, { itemId: 'fire_gem', quantity: 5 }] },
  },
  moonfall_star_chart: {
    id: 'moonfall_star_chart',
    name: 'Moonfall Star Chart',
    description: 'Chartist Luma wants a star map drawn from things that move even when the sky stands still.',
    npcId: 'star_chartist_luma',
    minLevel: 34,
    stages: [
      { id: 'borrow_lumas_lens', description: 'Borrow Luma\'s cold-lens and sky pins.', objective: { kind: 'talk', npcId: 'star_chartist_luma' } },
      { id: 'cut_starglass_threads', description: 'Cut down 6 starglass weavers before they re-thread the chart.', objective: { kind: 'kill', enemyType: 'starglass_weaver', count: 6 } },
      { id: 'dim_lumen_wardens', description: 'Dim 4 lumen wardens guarding the old star stones.', objective: { kind: 'kill', enemyType: 'lumen_warden', count: 4 } },
      { id: 'mark_moonfall_arc', description: 'Mark the moonfall arc on the high ridge.', objective: { kind: 'reach', position: { x: -319_000, y: 0.5, z: -258_900 }, radius: 24 }, marker: { x: -319_000, y: 0.5, z: -258_900 } },
      { id: 'return_star_chart', description: 'Return the cold-lens to Luma.', objective: { kind: 'talk', npcId: 'star_chartist_luma' } },
    ],
    reward: { xp: 340_000, gold: 6_000, items: [{ itemId: 'starward_visor', quantity: 1 }, { itemId: 'star_essence', quantity: 3 }] },
  },
  marsh_silence_pact: {
    id: 'marsh_silence_pact',
    name: 'Marsh Silence Pact',
    description: 'Marshal Orrin says the wetland is speaking through stolen voices; he needs the loudest mouths closed.',
    npcId: 'marsh_marshal_orrin',
    minLevel: 37,
    stages: [
      { id: 'hear_orrins_pact', description: 'Hear Orrin\'s pact beside the blackwater causeway.', objective: { kind: 'talk', npcId: 'marsh_marshal_orrin' } },
      { id: 'fell_bog_reavers', description: 'Fell 5 bog reavers holding the causeway stones.', objective: { kind: 'kill', enemyType: 'bog_reaver', count: 5 } },
      { id: 'snuff_lantern_wraiths', description: 'Snuff 5 lantern wraiths before they call another tide.', objective: { kind: 'kill', enemyType: 'lantern_wraith', count: 5 } },
      { id: 'bind_marsh_silence', description: 'Bind the silence at the drowned marker.', objective: { kind: 'reach', position: { x: 151_200, y: 0.5, z: 388_400 }, radius: 24 }, marker: { x: 151_200, y: 0.5, z: 388_400 } },
      { id: 'close_silence_pact', description: 'Return to Orrin before the marsh answers.', objective: { kind: 'talk', npcId: 'marsh_marshal_orrin' } },
    ],
    reward: { xp: 450_000, gold: 7_000, items: [{ itemId: 'marshward_boots', quantity: 1 }, { itemId: 'abyssal_pearl', quantity: 2 }] },
  },
  zero_hour_breach: {
    id: 'zero_hour_breach',
    name: 'Zero-Hour Breach',
    description: 'Riftwright Nessa found a breach that opens at the same hour every hour, and each hour is getting closer.',
    npcId: 'riftwright_nessa',
    minLevel: 40,
    stages: [
      { id: 'read_zero_hour', description: 'Read Nessa\'s zero-hour marks at the desert glassline.', objective: { kind: 'talk', npcId: 'riftwright_nessa' } },
      { id: 'shatter_glass_harriers', description: 'Shatter 6 glass harriers before they spread the breach.', objective: { kind: 'kill', enemyType: 'glass_harrier', count: 6 } },
      { id: 'stop_rift_menders', description: 'Stop 4 rift menders repairing the wrong timeline.', objective: { kind: 'kill', enemyType: 'rift_mender', count: 4 } },
      { id: 'stand_at_zero_hour', description: 'Stand at the zero-hour breach and hold the mark steady.', objective: { kind: 'reach', position: { x: -418_800, y: 0.5, z: 358_900 }, radius: 24 }, marker: { x: -418_800, y: 0.5, z: 358_900 } },
      { id: 'seal_zero_hour', description: 'Return to Nessa with the sealed loop.', objective: { kind: 'talk', npcId: 'riftwright_nessa' } },
    ],
    reward: { xp: 600_000, gold: 8_500, items: [{ itemId: 'zero_hour_loop', quantity: 1 }, { itemId: 'temporal_shard', quantity: 4 }] },
  },
};
