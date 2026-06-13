import { useSyncExternalStore } from 'react';
import { chooseWorldArtQuality, type WorldArtQuality } from './world-art/quality';

/**
 * User-controlled graphics settings. Every art knob that used to be hardcoded
 * to the auto-detected `worldArtQuality` tier is exposed here so each player —
 * desktop or mobile — decides for themselves.
 *
 * Model: a master `tier` (or `'auto'` = device detection) drives a PRESET, and
 * each individual knob is tri-state `'auto' | value` — `'auto'` follows the
 * resolved tier's preset, an explicit value overrides it. So the defaults
 * (everything `'auto'`, tier `'auto'`) reproduce the exact current behaviour;
 * the presets below mirror what the code did per tier.
 *
 * Stored in localStorage (best-effort; private-browsing/quota errors swallowed)
 * and exposed via a module store so any component reads it with
 * `useGraphicsSettings()` — no provider threading. Live where possible; settings
 * flagged in NEEDS_RELOAD only take full effect after a page reload (they're set
 * once at WebGLRenderer/Canvas creation), so the panel offers a reload button.
 */

export type Tier = WorldArtQuality; // 'low' | 'medium' | 'high'
export type TierSetting = 'auto' | Tier;
type Tri<T> = 'auto' | T;

export interface GraphicsSettings {
  tier: TierSetting;
  resolutionScale: Tri<number>; // device-pixel-ratio cap, 0.5..2
  shadows: Tri<boolean>;
  bloom: Tri<boolean>;
  godRays: Tri<boolean>;
  antialias: Tri<boolean>;
  valeHD: Tri<boolean>; // glacial vale: deedy's refraction + ACES renderer
  fog: Tri<boolean>;
  viewDistance: Tri<number>; // multiplier on fog/foliage reach, 0.6..1.4
  foliageDensity: Tri<number>; // 0..1.4
  grassDensity: Tri<number>; // 0..1.4
}

export interface ResolvedGraphics {
  tier: Tier;
  resolutionScale: number;
  shadows: boolean;
  bloom: boolean;
  godRays: boolean;
  antialias: boolean;
  valeHD: boolean;
  fog: boolean;
  viewDistance: number;
  foliageDensity: number;
  grassDensity: number;
}

/**
 * Per-tier presets — reproduce the previously-hardcoded behaviour EXACTLY at the
 * defaults, so `tier:'auto'` + every knob `'auto'` renders bit-for-bit as before.
 *
 * resolutionScale/shadows/bloom/godRays/antialias/valeHD/fog are exact mirrors of
 * the old per-tier branches (low = phone-lite: dpr 1.15, no shadows/bloom/godRays,
 * no vale HD; med/high add them; antialias + fog always on). viewDistance /
 * foliageDensity / grassDensity are NEUTRAL multipliers (1.0) layered on top of
 * the tier's existing reach/counts — the tier already thins those internally
 * (foliageRadius, grass layer counts, fog range), so 1.0 changes nothing and the
 * user dials them as an override (0.5..1.4) to trade detail for frame-rate.
 */
const TIER_PRESETS: Record<Tier, Omit<ResolvedGraphics, 'tier'>> = {
  low: { resolutionScale: 1.15, shadows: false, bloom: false, godRays: false, antialias: true, valeHD: false, fog: true, viewDistance: 1.0, foliageDensity: 1.0, grassDensity: 1.0 },
  medium: { resolutionScale: 1.5, shadows: true, bloom: true, godRays: true, antialias: true, valeHD: true, fog: true, viewDistance: 1.0, foliageDensity: 1.0, grassDensity: 1.0 },
  high: { resolutionScale: 2.0, shadows: true, bloom: true, godRays: true, antialias: true, valeHD: true, fog: true, viewDistance: 1.0, foliageDensity: 1.0, grassDensity: 1.0 },
};

export const DEFAULT_SETTINGS: GraphicsSettings = {
  tier: 'auto', resolutionScale: 'auto', shadows: 'auto', bloom: 'auto', godRays: 'auto',
  antialias: 'auto', valeHD: 'auto', fog: 'auto', viewDistance: 'auto', foliageDensity: 'auto', grassDensity: 'auto',
};

/** Settings that only take full effect after a reload (set at canvas creation). */
export const NEEDS_RELOAD: ReadonlySet<keyof GraphicsSettings> = new Set(['tier', 'resolutionScale', 'shadows', 'antialias']);

const STORAGE_KEY = 'vibeage.graphics.v1';

function loadSettings(): GraphicsSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: GraphicsSettings = loadSettings();
const listeners = new Set<() => void>();

function persist(): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* best-effort */ }
}

export function getGraphicsSettings(): GraphicsSettings {
  return current;
}

export function setGraphicsSetting<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  persist();
  for (const l of listeners) l();
}

export function resetGraphicsSettings(): void {
  current = { ...DEFAULT_SETTINGS };
  persist();
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Reactive read of the raw settings (re-renders on change). */
export function useGraphicsSettings(): GraphicsSettings {
  return useSyncExternalStore(subscribe, getGraphicsSettings, () => DEFAULT_SETTINGS);
}

const pick = <T,>(v: Tri<T>, fallback: T): T => (v === 'auto' ? fallback : v);

/** Resolve the raw settings into concrete values the render path consumes. */
export function resolveGraphics(s: GraphicsSettings): ResolvedGraphics {
  const tier: Tier = s.tier === 'auto' ? chooseWorldArtQuality() : s.tier;
  const p = TIER_PRESETS[tier];
  return {
    tier,
    resolutionScale: pick(s.resolutionScale, p.resolutionScale),
    shadows: pick(s.shadows, p.shadows),
    bloom: pick(s.bloom, p.bloom),
    godRays: pick(s.godRays, p.godRays),
    antialias: pick(s.antialias, p.antialias),
    valeHD: pick(s.valeHD, p.valeHD),
    fog: pick(s.fog, p.fog),
    viewDistance: pick(s.viewDistance, p.viewDistance),
    foliageDensity: pick(s.foliageDensity, p.foliageDensity),
    grassDensity: pick(s.grassDensity, p.grassDensity),
  };
}

/** Reactive resolved graphics — the render path's single source of truth. */
export function useResolvedGraphics(): ResolvedGraphics {
  return resolveGraphics(useGraphicsSettings());
}
