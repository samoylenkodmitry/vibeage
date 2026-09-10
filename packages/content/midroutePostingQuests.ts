import type { QuestDef } from './quests.js';

/**
 * L21 and L27 were the last single-level holes in the mid route: the player hit
 * Lv 21 with nothing offered until 22, and Lv 27 with nothing until 28.
 *
 * Both postings are issued and closed at Quartermaster Vane's table outside
 * Gludin, a stop the route already makes, so filling the holes costs no
 * cross-region leg. Saila's relay chain owns the Lv 20-31 bridge line, so these
 * deliberately sit on Vane and on mobs no other quest claims.
 */
export const MIDROUTE_POSTING_QUESTS: Record<string, QuestDef> = {
  the_quiet_bells: {
    id: 'the_quiet_bells',
    name: 'The Quiet Bells',
    description: 'Vane hangs a warning bell at every posting he supplies, and three of them have stopped answering the evening call. He would rather send one walker up the line than pull a whole patrol off it.',
    npcId: 'frontier_quartermaster_vane',
    minLevel: 21,
    // Gated on the specialization beat: Vane only signs walkers who have
    // already chosen a path, which is exactly what happens at Lv 20.
    prerequisites: { completedQuests: ['choose_your_path'] },
    stages: [
      {
        id: 'take_vane_bell_list',
        description: 'Take the bell list from Quartermaster Vane.',
        objective: { kind: 'talk', npcId: 'frontier_quartermaster_vane' },
        marker: { x: 154, y: 0.5, z: 92 },
      },
      {
        id: 'walk_the_north_bell',
        description: 'Reach the north posting and check the bell rope.',
        objective: { kind: 'reach', position: { x: 196, y: 0.5, z: 142 }, radius: 9 },
        marker: { x: 196, y: 0.5, z: 142 },
      },
      {
        id: 'clear_the_bell_wraiths',
        description: 'Clear 5 wraiths hanging around the silent bells.',
        objective: { kind: 'kill', enemyType: 'wraith', count: 5 },
        marker: { x: 208, y: 0.5, z: 156 },
      },
      {
        id: 'ring_vane_back',
        description: 'Report the quiet stretch back to Vane.',
        objective: { kind: 'talk', npcId: 'frontier_quartermaster_vane' },
        marker: { x: 154, y: 0.5, z: 92 },
      },
    ],
    // Sized to the Lv 21 -> 22 step the xpContentBudget audit reports, and kept
    // under the Lv 22 chain so it reads as a posting, not a payday.
    reward: { xp: 1300, gold: 430, items: [{ itemId: 'health_potion', quantity: 6 }, { itemId: 'mana_potion', quantity: 4 }] },
  },
  the_long_cutline: {
    id: 'the_long_cutline',
    name: 'The Long Cutline',
    description: 'Vane will not sign off on another season of the western firebreak until someone walks it end to end. Cold work, honest pay, and nobody has come back describing the far stake the same way twice.',
    npcId: 'frontier_quartermaster_vane',
    minLevel: 27,
    // Follows the bell list: Vane hands the long walk to someone whose short
    // walk already came back accurate, which threads both postings into one story.
    prerequisites: { completedQuests: ['the_quiet_bells'] },
    stages: [
      {
        id: 'draw_vane_kit',
        description: 'Draw the cutline kit from Quartermaster Vane.',
        objective: { kind: 'talk', npcId: 'frontier_quartermaster_vane' },
        marker: { x: 154, y: 0.5, z: 92 },
      },
      {
        id: 'clear_the_cut_timber',
        description: 'Clear 7 spiders nesting in the felled cut timber.',
        objective: { kind: 'kill', enemyType: 'spider', count: 7 },
        marker: { x: 96, y: 0.5, z: 168 },
      },
      {
        id: 'break_the_stake_wards',
        description: 'Break 4 crystal guardians standing over the old survey stakes.',
        objective: { kind: 'kill', enemyType: 'crystal_guardian', count: 4 },
        marker: { x: 74, y: 0.5, z: 184 },
      },
      {
        id: 'walk_the_far_stake',
        description: 'Reach the far survey stake at the end of the cut.',
        objective: { kind: 'reach', position: { x: 52, y: 0.5, z: 206 }, radius: 9 },
        marker: { x: 52, y: 0.5, z: 206 },
      },
      {
        id: 'sign_off_cutline',
        description: 'Sign the cutline off with Quartermaster Vane.',
        objective: { kind: 'talk', npcId: 'frontier_quartermaster_vane' },
        marker: { x: 154, y: 0.5, z: 92 },
      },
    ],
    // Sized to the Lv 27 -> 28 step; the pelts are the trophy Vane actually
    // wanted out of the cut, and already exist as a drop item.
    reward: { xp: 2600, gold: 880, items: [{ itemId: 'greyfang_pelt', quantity: 2 }, { itemId: 'greater_health_potion', quantity: 5 }] },
  },
};
