import { playSampleLayers, type SampleLayer } from './samples';
import { CUE_CLIPS, HIT_SAMPLES, KILL_BODY_SAMPLES, SUB_BOOM_SAMPLES, WINDUP_CHARGE_SAMPLES } from './sampleMap';

/**
 * HUD / status cues — short, non-positional sounds for moments the player should
 * notice (taking damage, levelling, dying, low health, a chat ping). All real
 * CC0 samples (Kenney *Interface Sounds* + a couple of impact clips for weight);
 * no synthesis. Each cue is one or more layers played together. The 9 HUD bridges
 * call playCue() — keeping that API means they don't care these are now samples.
 */

export type CueId =
  | 'hurt' | 'hit' | 'levelUp' | 'pickup' | 'kill' | 'respawn'
  | 'death' | 'lowHealth' | 'lowMana' | 'bossTelegraph' | 'chat';

const CUE_LAYERS: Record<CueId, SampleLayer[]> = {
  // You take damage — a short low negative buzz.
  hurt: [{ urls: [CUE_CLIPS.error], gain: 0.5 }],
  // Legacy generic hit blip (kept for the API; combat hits play spatially).
  hit: [{ urls: HIT_SAMPLES, gain: 0.5 }],
  // Level up / quest & boss reward — a bright ding rising into a positive swell.
  levelUp: [{ urls: [CUE_CLIPS.confirm], gain: 0.5 }, { urls: [CUE_CLIPS.maximizeBright], gain: 0.45 }],
  // A stat / item gained — a short plucked confirm.
  pickup: [{ urls: [CUE_CLIPS.pluck], gain: 0.5 }],
  // Legacy synth kill blip → a low resonant hit.
  kill: [{ urls: [CUE_CLIPS.bong], gain: 0.45 }],
  // You come back to life — a soft rising swell.
  respawn: [{ urls: [CUE_CLIPS.maximizeSoft], gain: 0.5 }],
  // You die — a descending tone with a deep boom under it for weight.
  death: [{ urls: [CUE_CLIPS.minimizeDown], gain: 0.5 }, { urls: SUB_BOOM_SAMPLES, gain: 0.4 }],
  // Heartbeat under 20% HP — a soft, dull body thud, quiet.
  lowHealth: [{ urls: KILL_BODY_SAMPLES, gain: 0.3 }],
  // Under 20% mana — a short quiet descending tick.
  lowMana: [{ urls: [CUE_CLIPS.minimizeShort], gain: 0.3 }],
  // A boss winds up a dangerous attack — the energy charge pitched low into a
  // slow, ominous swell.
  bossTelegraph: [{ urls: WINDUP_CHARGE_SAMPLES, gain: 0.4, rate: 0.6 }],
  // A chat message arrives — a soft friendly blip.
  chat: [{ urls: [CUE_CLIPS.select], gain: 0.3 }],
};

/** Every cue id — used by the wiki Sounds library + its completeness test. */
export const CUE_IDS = Object.keys(CUE_LAYERS) as CueId[];

/** The layers a cue plays — exposed so the wiki can show what each cue is made of. */
export function cueLayers(cue: CueId): SampleLayer[] {
  return CUE_LAYERS[cue];
}

export function playCue(cue: CueId): void {
  playSampleLayers(CUE_LAYERS[cue]);
}
