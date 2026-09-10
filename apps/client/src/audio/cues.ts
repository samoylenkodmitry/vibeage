import { playSampleLayers, type SampleLayer } from './samples';
import {
  HIT_SAMPLES,
  KILL_BODY_SAMPLES,
  LOOT_SAMPLES,
  LOW_SWELL_SAMPLES,
  SOFT_CLOTH_SAMPLES,
  SUB_BOOM_SAMPLES,
  WINDUP_CHARGE_SAMPLES,
} from './sampleMap';

/**
 * HUD / status cues — deliberately **minimal & subtle**: soft, low, barely-there
 * feedback rather than arcade beeps. The whole palette is three textures kept
 * quiet and pitched per moment: a soft body thud (impactSoft) for hits/heartbeat,
 * a soft cloth rustle for light confirmations, a gentle energy swell up (the
 * cast-charge clip) for "good" moments, and a short low swell down for heavy or
 * ominous ones. All real CC0 samples. The 9 HUD bridges call playCue() — keeping
 * that API means they don't care what's behind it.
 */

export type CueId =
  | 'hurt' | 'hit' | 'levelUp' | 'pickup' | 'kill' | 'respawn'
  | 'death' | 'lowHealth' | 'lowMana' | 'bossTelegraph' | 'chat'
  | 'loot' | 'equip' | 'learnSkill' | 'questAccept' | 'questStage' | 'bossEngage';

const CUE_LAYERS: Record<CueId, SampleLayer[]> = {
  // You take damage — a soft, dull low thud.
  hurt: [{ urls: KILL_BODY_SAMPLES, gain: 0.4, rate: 0.92 }],
  // Legacy generic hit cue (combat hits play spatially); kept quiet.
  hit: [{ urls: HIT_SAMPLES, gain: 0.3 }],
  // Level up / quest & boss reward — a gentle bright swell up, no fanfare.
  levelUp: [{ urls: WINDUP_CHARGE_SAMPLES, gain: 0.3, rate: 1.3 }],
  // A stat / item gained — a soft cloth rustle.
  pickup: [{ urls: SOFT_CLOTH_SAMPLES, gain: 0.35, rate: 1.1 }],
  // Legacy kill cue — a soft low thud.
  kill: [{ urls: KILL_BODY_SAMPLES, gain: 0.32, rate: 0.85 }],
  // You come back to life — a soft warm swell up.
  respawn: [{ urls: WINDUP_CHARGE_SAMPLES, gain: 0.3, rate: 1.0 }],
  // You die — a low swell down with a faint deep boom under it.
  death: [{ urls: LOW_SWELL_SAMPLES, gain: 0.35 }, { urls: SUB_BOOM_SAMPLES, gain: 0.22, rate: 0.9 }],
  // Heartbeat under 20% HP — a soft, dull body thud, quiet.
  lowHealth: [{ urls: KILL_BODY_SAMPLES, gain: 0.28, rate: 0.9 }],
  // Under 20% mana — a short, quiet low swell.
  lowMana: [{ urls: LOW_SWELL_SAMPLES, gain: 0.22, rate: 1.2 }],
  // A boss winds up a dangerous attack — a low, ominous swell (a touch louder).
  bossTelegraph: [{ urls: LOW_SWELL_SAMPLES, gain: 0.4, rate: 0.85 }],
  // A chat message arrives — a faint, light cloth tick.
  chat: [{ urls: SOFT_CLOTH_SAMPLES, gain: 0.25, rate: 1.35 }],
  // Loot lands in your bag — the coin handling clip, the one literal sound in
  // the palette. Quiet, and the bridge jitters its pitch so a fast looter hears
  // a purse being worked rather than the same clip machine-gunned.
  loot: [{ urls: LOOT_SAMPLES, gain: 0.4 }],
  // Gear goes on — cloth pitched *down* from 'pickup' so armour settling reads
  // heavier than a stat tick, with a faint low body under it.
  equip: [{ urls: SOFT_CLOTH_SAMPLES, gain: 0.32, rate: 0.85 }, { urls: KILL_BODY_SAMPLES, gain: 0.14, rate: 1.2 }],
  // A skill is learned — the same swell as levelUp but lower and quieter: a
  // real gain, deliberately smaller than gaining a level.
  learnSkill: [{ urls: WINDUP_CHARGE_SAMPLES, gain: 0.26, rate: 1.12 }],
  // A quest is taken on — a page-ish cloth turn plus a soft weight settling.
  questAccept: [{ urls: SOFT_CLOTH_SAMPLES, gain: 0.3, rate: 0.95 }, { urls: LOW_SWELL_SAMPLES, gain: 0.14, rate: 1.25 }],
  // A quest stage advances — the quietest cue here on purpose: progress should
  // register without competing with the completion swell.
  questStage: [{ urls: SOFT_CLOTH_SAMPLES, gain: 0.24, rate: 1.2 }],
  // A boss commits to you — a deep swell under a quiet sub-boom. Pitched below
  // 'bossTelegraph' so "it noticed you" reads as the bigger, slower moment.
  bossEngage: [{ urls: LOW_SWELL_SAMPLES, gain: 0.4, rate: 0.7 }, { urls: SUB_BOOM_SAMPLES, gain: 0.18, rate: 0.8 }],
};

/** Every cue id — used by the wiki Sounds library + its completeness test. */
export const CUE_IDS = Object.keys(CUE_LAYERS) as CueId[];

/** The layers a cue plays — exposed so the wiki can show what each cue is made of. */
export function cueLayers(cue: CueId): SampleLayer[] {
  return CUE_LAYERS[cue];
}

/**
 * `rateScale` pitch-shifts the whole cue — the repeated cues (loot above all)
 * pass a small random scale so hearing one twenty times in a minute doesn't
 * read as a stuck sample. 1 = the cue exactly as authored.
 */
export function playCue(cue: CueId, rateScale = 1): void {
  const layers = CUE_LAYERS[cue];
  playSampleLayers(
    rateScale === 1 ? layers : layers.map((l) => ({ ...l, rate: (l.rate ?? 1) * rateScale })),
  );
}
