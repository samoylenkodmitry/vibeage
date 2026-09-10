import { type CueId } from './cues';
import {
  AMBIENT_DAY,
  AMBIENT_NIGHT,
  COMBAT_GAIN,
  HIT_SAMPLES,
  KILL_SAMPLES,
  KILL_BODY_SAMPLES,
  LOOT_SAMPLES,
  UI_SAMPLES,
  SUB_BOOM_SAMPLES,
  SUPPORT_SPARKLE_SAMPLES,
  WINDUP_CHARGE_SAMPLES,
  impactSamplesFor,
  impactGainFor,
  travelSamplesFor,
  travelGainFor,
} from './sampleMap';
import { SPELL_ELEMENTS, type Elem } from './skillAudio';
import { SURFACES, footstepLayers, gustLayers, lapLayers, type Surface } from './surfaces';

/**
 * The in-game **sound library** — every sound the game plays, named and grouped
 * by when you hear it (cast → travel → impact → events → cues → ambient). All
 * real CC0 samples now (no synthesis). Derived from the same maps the engine
 * plays from (sampleMap / skillAudio / cues), so the wiki page can never drift
 * out of sync with what actually ships. Each entry carries playable `variants`.
 */

export type SoundPreview =
  | { kind: 'sample'; urls: readonly string[]; gain: number }
  | { kind: 'cue'; cue: CueId };

export type SoundVariant = { name: string; preview: SoundPreview };

export type SoundEntry = {
  id: string;
  title: string;
  detail: string;
  /** Short badge: how it's played — 'spatial', 'ui', or 'loop'. */
  tag: string;
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

// --- Phase 1: cast charge (sample) -----------------------------------------
const castGroup: SoundGroup = {
  id: 'cast',
  title: 'Cast — charge (sample)',
  blurb: 'A sci-fi energy charge as a spell is cast — pitched lower for fire/poison, higher for ice/holy, plus a per-skill detune.',
  entries: [
    {
      id: 'cast-charge',
      title: 'Cast charge',
      detail: 'One charge sample, pitched per element & per skill in game',
      tag: 'spatial',
      variants: sampleVariants(WINDUP_CHARGE_SAMPLES, 0.3),
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
    tag: 'spatial',
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
      tag: 'spatial',
      variants: sampleVariants(impactSamplesFor(e), impactGainFor(e)),
    })),
    {
      id: 'impact-subboom',
      title: 'Heavy sub-boom (layer)',
      detail: 'Deep boom layered under heavy & fire impacts for weight',
      tag: 'spatial',
      variants: sampleVariants(SUB_BOOM_SAMPLES, 0.5),
    },
    {
      id: 'impact-support',
      title: 'Heal / buff sparkle',
      detail: 'A bright, quiet sparkle for a support skill settling on an ally',
      tag: 'spatial',
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
      tag: 'spatial',
      variants: sampleVariants(HIT_SAMPLES, COMBAT_GAIN),
    },
    {
      id: 'event-kill',
      title: 'Kill (layered)',
      detail: 'A mob dies — deep explosion + soft body thud, layered through one voice',
      tag: 'spatial',
      variants: [...sampleVariants(KILL_SAMPLES, 0.55), ...sampleVariants(KILL_BODY_SAMPLES, COMBAT_GAIN)],
    },
    {
      id: 'event-loot',
      title: 'Loot',
      detail: 'Coins / pickup handling',
      tag: 'spatial',
      variants: sampleVariants(LOOT_SAMPLES, 0.7),
    },
    {
      id: 'event-ui',
      title: 'UI click',
      detail: 'Generic interface click',
      tag: 'spatial',
      variants: sampleVariants(UI_SAMPLES, 0.7),
    },
  ],
};

// --- UI & status cues (sample) ---------------------------------------------
const CUES: ReadonlyArray<{ cue: CueId; title: string; detail: string }> = [
  { cue: 'hurt', title: 'Hurt', detail: 'You take damage (red vignette)' },
  { cue: 'levelUp', title: 'Level up', detail: 'Level gained / quest & boss reward' },
  { cue: 'pickup', title: 'Pickup', detail: 'A stat or item is gained' },
  { cue: 'respawn', title: 'Respawn', detail: 'You come back to life' },
  { cue: 'death', title: 'Death', detail: 'You die — low swell down + deep boom' },
  { cue: 'lowHealth', title: 'Low health', detail: 'Heartbeat under 20% HP' },
  { cue: 'lowMana', title: 'Low mana', detail: 'Under 20% mana (casters)' },
  { cue: 'bossTelegraph', title: 'Boss telegraph', detail: 'A boss winds up a dangerous attack' },
  { cue: 'chat', title: 'Chat', detail: 'A chat message arrives' },
  { cue: 'loot', title: 'Loot picked up', detail: 'Loot lands in your bag — pitch-jittered per pickup' },
  { cue: 'equip', title: 'Item equipped', detail: 'Gear goes on — cloth settling with a soft body under it' },
  { cue: 'learnSkill', title: 'Skill learned', detail: 'A new skill unlocked — a smaller swell than a level' },
  { cue: 'questAccept', title: 'Quest accepted', detail: 'You take on a quest' },
  { cue: 'questStage', title: 'Quest stage advanced', detail: 'A quest objective ticks over — the quietest cue' },
  { cue: 'bossEngage', title: 'Boss engages', detail: 'A mini-boss enters combat with you' },
  { cue: 'hit', title: 'Hit (cue)', detail: 'Legacy generic-hit cue' },
  { cue: 'kill', title: 'Kill (cue)', detail: 'Legacy kill cue — a soft low thud' },
];

const cuesGroup: SoundGroup = {
  id: 'cues',
  title: 'UI & status cues (sample)',
  blurb: 'Minimal, subtle HUD / status feedback — soft thuds, cloth, low swells (CC0). No fanfare.',
  entries: CUES.map((c): SoundEntry => ({
    id: `cue-${c.cue}`,
    title: c.title,
    detail: c.detail,
    tag: 'ui',
    variants: [{ name: c.cue, preview: { kind: 'cue', cue: c.cue } }],
  })),
};

// --- Movement & place (sample) ---------------------------------------------
const SURFACE_LABEL: Record<Surface, string> = {
  grass: 'Grass — meadow, open field',
  undergrowth: 'Undergrowth — forest leaf litter',
  stone: 'Stone — highland, ruins, canyon rock',
  snow: 'Snow — tundra, the Glacial Vale',
  sand: 'Sand & ash — shoreline, volcanic grit',
  bog: 'Bog — wetland muck',
  water: 'Water — wading, ankle-deep or worse',
};

/** One playable chip per clip a layer set draws on, at the gain it plays with. */
function layerVariants(layers: readonly { urls: readonly string[]; gain?: number }[]): SoundVariant[] {
  return layers.flatMap((layer) => sampleVariants(layer.urls, layer.gain ?? 1));
}

const movementGroup: SoundGroup = {
  id: 'movement',
  title: 'Movement & place (sample)',
  blurb: 'Footsteps pick their clip from the terrain under you; wind and shore lapping come from where you are standing. All re-pitched from clips the game already ships — the previews play at the in-game level, which is deliberately low.',
  entries: [
    ...SURFACES.map((surface): SoundEntry => ({
      id: `step-${surface}`,
      title: SURFACE_LABEL[surface],
      detail: 'Footstep — distance-driven cadence, pitched per foot',
      tag: 'ui',
      variants: layerVariants(footstepLayers(surface, 0)),
    })),
    {
      id: 'place-gust',
      title: 'Wind gust',
      detail: 'A passing air rush — more often and louder on exposed ridges and shorelines',
      tag: 'spatial',
      variants: layerVariants(gustLayers(1)),
    },
    {
      id: 'place-lap',
      title: 'Shore lapping',
      detail: 'Water working at a lake or vale shoreline, placed toward the actual water',
      tag: 'spatial',
      variants: layerVariants(lapLayers(1)),
    },
  ],
};

// --- Ambient beds (looping samples) ----------------------------------------
const ambientGroup: SoundGroup = {
  id: 'ambient',
  title: 'Ambient (loops)',
  blurb: 'Looping nature beds, cross-faded by day/night (OpenGameArt CC0). Preview plays one pass.',
  entries: [
    {
      id: 'ambient-day',
      title: 'Day — forest',
      detail: 'Calm forest ambience (gentle wind + birds), up by day',
      tag: 'loop',
      variants: sampleVariants([AMBIENT_DAY], 0.4),
    },
    {
      id: 'ambient-night',
      title: 'Night — crickets',
      detail: 'Crickets, up by night',
      tag: 'loop',
      variants: sampleVariants([AMBIENT_NIGHT], 0.4),
    },
  ],
};

export const SOUND_GROUPS: readonly SoundGroup[] = [
  castGroup, travelGroup, impactGroup, eventsGroup, movementGroup, cuesGroup, ambientGroup,
];

/** Every sample url the catalog references via play chips — used by the completeness test. */
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

/** Every cue the catalog references — used by the completeness test. */
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
