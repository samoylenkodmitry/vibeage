import type { CueId } from '../sfx';
import {
  COMBAT_GAIN,
  HIT_SAMPLES,
  KILL_SAMPLES,
  KILL_BODY_SAMPLES,
  LOOT_SAMPLES,
  UI_SAMPLES,
  SUB_BOOM_SAMPLES,
  SUPPORT_SPARKLE_SAMPLES,
  impactSamplesFor,
  impactGainFor,
  travelSamplesFor,
  travelGainFor,
} from './sampleMap';
import { elementWindup, SPELL_ELEMENTS, SUPPORT_WINDUP, type Elem } from './skillAudio';
import type { WindupParams } from './spellVoices';

/**
 * The in-game **sound library** — every sound the game plays, named and grouped
 * by when you hear it (cast → travel → impact → events → UI cues). Derived from
 * the same maps the engine plays from (sampleMap / skillAudio / sfx cues), so the
 * wiki page can never drift out of sync with what actually ships. Each entry
 * carries playable `variants` so a row can be auditioned in game.
 */

export type SoundPreview =
  | { kind: 'sample'; urls: readonly string[]; gain: number }
  | { kind: 'windup'; params: WindupParams }
  | { kind: 'cue'; cue: CueId };

export type SoundVariant = { name: string; preview: SoundPreview };

export type SoundEntry = {
  id: string;
  title: string;
  detail: string;
  /** true = synthesized on the fly (no asset file); false = a recorded .ogg sample. */
  synth: boolean;
  variants: SoundVariant[];
};

export type SoundGroup = { id: string; title: string; blurb: string; entries: SoundEntry[] };

function basename(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

/** One playable chip per file in the set, named by its .ogg filename. */
function sampleVariants(urls: readonly string[], gain: number): SoundVariant[] {
  return urls.map((url) => ({ name: basename(url), preview: { kind: 'sample', urls: [url], gain } }));
}

const ELEMENT_LABEL: Record<Elem, string> = {
  fire: 'Fire — roaring, explosive',
  ice: 'Ice — brittle, glassy',
  holy: 'Holy — bright, bell-like',
  poison: 'Poison — wet, hissing',
  arcane: 'Arcane — electric, zappy',
  physical: 'Physical — blunt, non-elemental',
};

// --- Phase 1: cast windups (synth) -----------------------------------------
const castGroup: SoundGroup = {
  id: 'cast',
  title: 'Cast — windup (synth)',
  blurb: 'The rising charge synthesized as a spell is cast, before it flies. Tinted per element; pitched per skill in game.',
  entries: [
    ...SPELL_ELEMENTS.map((e): SoundEntry => ({
      id: `cast-${e}`,
      title: ELEMENT_LABEL[e],
      detail: 'Cast windup',
      synth: true,
      variants: [{ name: `${e} windup`, preview: { kind: 'windup', params: elementWindup(e) } }],
    })),
    {
      id: 'cast-support',
      title: 'Heal / buff — uplifting swell',
      detail: 'Cast windup for support skills (soft, no harsh charge)',
      synth: true,
      variants: [{ name: 'support windup', preview: { kind: 'windup', params: SUPPORT_WINDUP } }],
    },
  ],
};

// --- Phase 2: travel whooshes (sample) -------------------------------------
const travelGroup: SoundGroup = {
  id: 'travel',
  title: 'Travel — whoosh (sample)',
  blurb: 'Played while a projectile is in flight (instant / self / AoE skills skip this phase).',
  entries: SPELL_ELEMENTS.map((e): SoundEntry => ({
    id: `travel-${e}`,
    title: ELEMENT_LABEL[e],
    detail: 'In-flight whoosh',
    synth: false,
    variants: sampleVariants(travelSamplesFor(e), travelGainFor(e)),
  })),
};

// --- Phase 3: impacts (sample) ---------------------------------------------
const impactGroup: SoundGroup = {
  id: 'impact',
  title: 'Impact — landing (sample)',
  blurb: 'Where a spell lands. Heavy / fire skills layer a deep sub-boom; heals & buffs land as a soft sparkle instead of a hit.',
  entries: [
    ...SPELL_ELEMENTS.map((e): SoundEntry => ({
      id: `impact-${e}`,
      title: ELEMENT_LABEL[e],
      detail: 'Spell impact',
      synth: false,
      variants: sampleVariants(impactSamplesFor(e), impactGainFor(e)),
    })),
    {
      id: 'impact-subboom',
      title: 'Heavy sub-boom (layer)',
      detail: 'Deep boom layered under heavy & fire impacts for weight',
      synth: false,
      variants: sampleVariants(SUB_BOOM_SAMPLES, 0.5),
    },
    {
      id: 'impact-support',
      title: 'Heal / buff sparkle',
      detail: 'A bright, quiet sparkle for a support skill settling on an ally',
      synth: false,
      variants: sampleVariants(SUPPORT_SPARKLE_SAMPLES, 0.4),
    },
  ],
};

// --- Combat & world events (sample) ----------------------------------------
const eventsGroup: SoundGroup = {
  id: 'events',
  title: 'Combat & world events (sample)',
  blurb: 'Non-spell positional sounds played by the combat / loot bridges.',
  entries: [
    {
      id: 'event-hit',
      title: 'Hit',
      detail: 'A landed melee / basic-attack hit',
      synth: false,
      variants: sampleVariants(HIT_SAMPLES, COMBAT_GAIN),
    },
    {
      id: 'event-kill',
      title: 'Kill (layered)',
      detail: 'A mob dies — deep explosion + soft body thud, layered through one voice',
      synth: false,
      variants: [...sampleVariants(KILL_SAMPLES, 0.55), ...sampleVariants(KILL_BODY_SAMPLES, COMBAT_GAIN)],
    },
    {
      id: 'event-loot',
      title: 'Loot',
      detail: 'Coins / pickup handling',
      synth: false,
      variants: sampleVariants(LOOT_SAMPLES, 0.7),
    },
    {
      id: 'event-ui',
      title: 'UI click',
      detail: 'Generic interface click',
      synth: false,
      variants: sampleVariants(UI_SAMPLES, 0.7),
    },
  ],
};

// --- UI & status cues (synth) ----------------------------------------------
const CUES: ReadonlyArray<{ cue: CueId; title: string; detail: string }> = [
  { cue: 'hurt', title: 'Hurt', detail: 'You take damage (red vignette)' },
  { cue: 'levelUp', title: 'Level up', detail: 'Level gained / quest & boss reward fanfare' },
  { cue: 'pickup', title: 'Pickup', detail: 'A stat or item is gained' },
  { cue: 'respawn', title: 'Respawn', detail: 'You come back to life' },
  { cue: 'death', title: 'Death', detail: 'You die — descending thud' },
  { cue: 'lowHealth', title: 'Low health', detail: 'Heartbeat under 20% HP' },
  { cue: 'lowMana', title: 'Low mana', detail: 'Under 20% mana (casters)' },
  { cue: 'bossTelegraph', title: 'Boss telegraph', detail: 'A boss winds up a dangerous attack' },
  { cue: 'chat', title: 'Chat', detail: 'A chat message arrives' },
  { cue: 'hit', title: 'Hit (synth)', detail: 'Legacy synth hit blip' },
  { cue: 'kill', title: 'Kill (synth)', detail: 'Legacy synth kill blip' },
];

const cuesGroup: SoundGroup = {
  id: 'cues',
  title: 'UI & status cues (synth)',
  blurb: 'Short non-positional synth tones for HUD / status moments.',
  entries: CUES.map((c): SoundEntry => ({
    id: `cue-${c.cue}`,
    title: c.title,
    detail: c.detail,
    synth: true,
    variants: [{ name: c.cue, preview: { kind: 'cue', cue: c.cue } }],
  })),
};

export const SOUND_GROUPS: readonly SoundGroup[] = [castGroup, travelGroup, impactGroup, eventsGroup, cuesGroup];

/** Every sample url the catalog references — used by the completeness test. */
export function allCatalogSampleUrls(): string[] {
  const urls: string[] = [];
  for (const group of SOUND_GROUPS) {
    for (const entry of group.entries) {
      for (const variant of entry.variants) {
        if (variant.preview.kind === 'sample') urls.push(...variant.preview.urls);
      }
    }
  }
  return urls;
}

/** Every synth cue the catalog references — used by the completeness test. */
export function allCatalogCueIds(): CueId[] {
  const ids: CueId[] = [];
  for (const group of SOUND_GROUPS) {
    for (const entry of group.entries) {
      for (const variant of entry.variants) {
        if (variant.preview.kind === 'cue') ids.push(variant.preview.cue);
      }
    }
  }
  return ids;
}
