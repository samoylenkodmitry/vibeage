import type { QuestDef } from './quests.js';

/**
 * The Nightbell Line — a five-part chain that fills the last quiet
 * stretch of the journey. Before this drop, levels 32, 33, 36, 38 and
 * 39 had no quest at all: the player reached the frontier camps and
 * then ground two full levels at a time with nothing pointing anywhere.
 *
 * Placement is deliberate rather than thematic-only. Each half sits in
 * a region the route already passes through at that level — Odris on
 * the Moonfall approach (the player is there for the star chart at 34),
 * Hesk on the Abyssal causeways (there for the silence pact at 37) —
 * so the chain adds objectives without adding a single cross-region
 * leg to an endgame route that is already almost entirely travel.
 * Markers stay inside the giver's own zone for the same reason.
 *
 * Stages open on the work rather than a "talk to me first" step: the
 * hook is in `description`, which the player reads in the accept
 * dialog, so the opening interaction would only repeat it.
 */
export const NIGHTBELL_QUESTS: Record<string, QuestDef> = {
  the_silent_line: {
    id: 'the_silent_line',
    name: 'The Silent Line',
    description: 'Every frontier station hangs a warning bell, and every bell answers the one before it. Bellwright Odris has been listening to them go quiet in order, west to east, and the last one still ringing is his.',
    npcId: 'bellwright_odris',
    minLevel: 32,
    // Iyen's cutline is the westernmost station on the line; word that it
    // stopped answering is what sends Odris looking for help.
    prerequisites: { completedQuests: ['sunspire_firebreak'] },
    stages: [
      { id: 'cut_glassthread_weavers', description: 'Cut down 3 star weavers stripping glass-thread off the relay run.', objective: { kind: 'kill', enemyType: 'star_weaver', count: 3 } },
      { id: 'climb_the_hanging_point', description: 'Climb to the Moonfall hanging-point and check the bell yoke.', objective: { kind: 'reach', position: { x: -318_260, y: 0.5, z: -259_470 }, radius: 26 }, marker: { x: -318_260, y: 0.5, z: -259_470 } },
      { id: 'report_the_yoke', description: 'Tell Odris what is left of the yoke.', objective: { kind: 'talk', npcId: 'bellwright_odris' } },
    ],
    reward: { xp: 5_200, gold: 5_400, items: [{ itemId: 'star_essence', quantity: 3 }, { itemId: 'greater_health_potion', quantity: 4 }] },
  },
  saltglass_clappers: {
    id: 'saltglass_clappers',
    name: 'Saltglass Clappers',
    description: 'A bell with no clapper is just an expensive hole in the weather. Odris can cast new ones, but the saltglass seam he pours from has ice giants sitting on it, and they were there first.',
    npcId: 'bellwright_odris',
    minLevel: 33,
    prerequisites: { completedQuests: ['the_silent_line'] },
    stages: [
      { id: 'clear_the_seam', description: 'Drive 3 ice giants off the saltglass seam.', objective: { kind: 'kill', enemyType: 'ice_giant', count: 3 } },
      { id: 'pour_at_the_foundry', description: 'Pour the new clappers at the cold foundry stone.', objective: { kind: 'reach', position: { x: -318_355, y: 0.5, z: -259_345 }, radius: 26 }, marker: { x: -318_355, y: 0.5, z: -259_345 } },
      { id: 'hang_the_clappers', description: 'Carry the cooled clappers back to Odris.', objective: { kind: 'talk', npcId: 'bellwright_odris' } },
    ],
    reward: { xp: 5_600, gold: 5_600, items: [{ itemId: 'frost_diamond', quantity: 2 }, { itemId: 'star_essence', quantity: 3 }] },
  },
  the_drowned_bell: {
    id: 'the_drowned_bell',
    name: 'The Drowned Bell',
    description: 'The eastern end of the line is a belfry the March swallowed a long time ago. Nightbell Warden Hesk has heard it ring twice this month, which is two more times than a drowned bell should.',
    npcId: 'nightbell_warden_hesk',
    minLevel: 36,
    prerequisites: { completedQuests: ['saltglass_clappers'] },
    stages: [
      { id: 'clear_the_belfry_nest', description: "Clear 3 tentacle horrors nesting in the belfry's flooded throat.", objective: { kind: 'kill', enemyType: 'tentacle_horror', count: 3 } },
      { id: 'reach_the_belfry', description: 'Wade out to the drowned belfry and find the bell rope.', objective: { kind: 'reach', position: { x: 150_945, y: 0.5, z: 388_155 }, radius: 26 }, marker: { x: 150_945, y: 0.5, z: 388_155 } },
      { id: 'report_the_rope', description: 'Tell Hesk the rope was already wet from the inside.', objective: { kind: 'talk', npcId: 'nightbell_warden_hesk' } },
    ],
    reward: { xp: 6_800, gold: 6_200, items: [{ itemId: 'moonfall_cloak', quantity: 1 }, { itemId: 'abyssal_pearl', quantity: 2 }] },
  },
  the_borrowed_voice: {
    id: 'the_borrowed_voice',
    name: 'The Borrowed Voice',
    description: "Odris rang the finished line from his end and the March answered before he let go of the rope. Hesk's patrol swears the ring came back in a voice they recognised, and not one of them will say whose.",
    npcId: 'nightbell_warden_hesk',
    minLevel: 38,
    prerequisites: { completedQuests: ['the_drowned_bell'] },
    stages: [
      { id: 'silence_the_echo_carriers', description: 'Put down 3 deep leviathans that surface along the causeway whenever the line is pulled.', objective: { kind: 'kill', enemyType: 'deep_leviathan', count: 3 } },
      { id: 'walk_the_causeway_lamps', description: 'Walk the causeway lamps and mark where the ring turns around.', objective: { kind: 'reach', position: { x: 151_055, y: 0.5, z: 388_040 }, radius: 26 }, marker: { x: 151_055, y: 0.5, z: 388_040 } },
      { id: 'name_the_turning_point', description: 'Give Hesk the lamp where the borrowed voice starts.', objective: { kind: 'talk', npcId: 'nightbell_warden_hesk' } },
    ],
    reward: { xp: 7_600, gold: 6_800, items: [{ itemId: 'riftcall_gloves', quantity: 1 }, { itemId: 'void_crystal', quantity: 2 }] },
  },
  the_last_nightbell: {
    id: 'the_last_nightbell',
    name: 'The Last Nightbell',
    description: 'Hesk wants the whole line rung at once, on purpose, with somebody standing under the last bell to see what answers when it is called. She is not pretending this is a safe thing to ask.',
    npcId: 'nightbell_warden_hesk',
    minLevel: 39,
    prerequisites: { completedQuests: ['the_borrowed_voice'] },
    stages: [
      { id: 'stand_under_the_bell', description: 'Stand under the last nightbell and pull the line.', objective: { kind: 'reach', position: { x: 150_955, y: 0.5, z: 388_045 }, radius: 26 }, marker: { x: 150_955, y: 0.5, z: 388_045 } },
      { id: 'answer_what_surfaces', description: 'Answer what the ringing brings up: 2 deep leviathans.', objective: { kind: 'kill', enemyType: 'deep_leviathan', count: 2 } },
      { id: 'hold_the_causeway', description: 'Hold the causeway while 2 tentacle horrors come up behind them.', objective: { kind: 'kill', enemyType: 'tentacle_horror', count: 2 } },
      { id: 'listen_once_more', description: 'Ring it a second time and listen. Nothing answers.', objective: { kind: 'manual', description: 'Press Next to ring the line once more.' } },
      { id: 'close_the_watch', description: 'Return to Hesk and close the watch.', objective: { kind: 'talk', npcId: 'nightbell_warden_hesk' } },
    ],
    reward: { xp: 8_200, gold: 7_200, items: [{ itemId: 'temporal_shard', quantity: 4 }, { itemId: 'abyssal_pearl', quantity: 3 }, { itemId: 'greater_health_potion', quantity: 6 }] },
  },
};
