import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STATS } from '../../../../packages/content/stats';
import {
  buildContributions,
  computeAllStats,
  type Contribution,
  type StatId,
  type StatPlayerView,
} from '../../../../packages/sim/statContributions';
import type { PlayerEntity } from '../gameTypes';
import { openWikiAt } from './wikiNavBus';

/**
 * PR OO — stat-breakdown popup. Clicking any stat on the player
 * panel opens this. Pure client-side derivation: the same
 * `computeAllStats` the server uses runs here over the client's
 * view of the player (race / class / level / equipment / active
 * status effects), so the total matches the engine's stored
 * value and the rows are the canonical breakdown.
 */
type Props = {
  statId: StatId;
  player: PlayerEntity;
  equipment: Record<string, string>;
  clientX: number;
  clientY: number;
  onClose: () => void;
};

export function StatBreakdownPopup({ statId, player, equipment, clientX, clientY, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: Math.max(8, clientX),
    top: Math.max(8, clientY - 12),
  }));

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, clientX),
      Math.max(margin, window.innerWidth - rect.width - margin),
    );
    const top = Math.min(
      Math.max(margin, clientY - rect.height - 12),
      Math.max(margin, window.innerHeight - rect.height - margin),
    );
    setPos({ left, top });
  }, [clientX, clientY, statId]);

  const breakdown = computeBreakdown(player, equipment, statId);
  const statDef = STATS[statId];
  const grouped = groupByPhase(breakdown?.parts ?? []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      className="stat-breakdown-popup"
      role="dialog"
      aria-label={`${statDef?.name ?? statId} breakdown`}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
    >
      <header>
        <strong>{statDef?.name ?? statId}</strong>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      {statDef?.description && <p>{statDef.description}</p>}
      <BreakdownSection label="Base" rows={grouped.base} formatter={formatBase} />
      <BreakdownSection label="Flat bonuses (pre-mul)" rows={grouped.addPre} formatter={formatSigned} />
      <BreakdownSection label="Multipliers" rows={grouped.mul} formatter={formatMul} />
      <BreakdownSection label="Flat bonuses (post-mul)" rows={grouped.addPost} formatter={formatSigned} />
      <footer className="stat-breakdown-total">
        <span>Total</span>
        <strong>{formatTotal(breakdown?.total ?? 0, statId)}</strong>
      </footer>
      <button
        type="button"
        className="tooltip-wiki-link"
        onClick={(e) => { e.stopPropagation(); openWikiAt('stats', statId); }}
        title="Open in Wiki"
      >Open in Wiki →</button>
    </div>,
    document.body,
  );
}

function computeBreakdown(player: PlayerEntity, equipment: Record<string, string>, statId: StatId) {
  const view: StatPlayerView = {
    level: player.level,
    race: player.race as StatPlayerView['race'],
    className: player.className,
    specializationId: player.specializationId ?? null,
    equippedTemplates: equipment as StatPlayerView['equippedTemplates'],
    statusEffects: player.statusEffects,
    health: player.health,
  };
  const result = computeAllStats(buildContributions(view), {
    level: view.level,
    race: view.race ?? 'human',
    className: view.className,
    health: view.health ?? 0,
    maxHealth: player.maxHealth || 1,
    hpFraction: player.maxHealth > 0 ? player.health / player.maxHealth : 1,
  });
  return result.breakdown[statId];
}

function groupByPhase(parts: readonly Contribution[]) {
  const base: Contribution[] = [];
  const addPre: Contribution[] = [];
  const mul: Contribution[] = [];
  const addPost: Contribution[] = [];
  for (const p of parts) {
    if (p.op === 'base') base.push(p);
    else if (p.op === 'addPre') addPre.push(p);
    else if (p.op === 'mul') mul.push(p);
    else if (p.op === 'addPost') addPost.push(p);
  }
  return { base, addPre, mul, addPost };
}

function BreakdownSection({
  label, rows, formatter,
}: { label: string; rows: readonly Contribution[]; formatter: (v: number) => string }) {
  if (rows.length === 0) return null;
  return (
    <section className="stat-breakdown-section">
      <h4>{label}</h4>
      <ul>
        {rows.map((row) => (
          <li key={row.source}>
            <span>{row.label}</span>
            <strong>{formatter(resolveValue(row))}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function resolveValue(c: Contribution): number {
  if (typeof c.value === 'function') return c.value({});
  return c.value;
}

function formatBase(v: number): string { return v.toFixed(0); }
function formatSigned(v: number): string {
  if (v === 0) return '0';
  return v > 0 ? `+${formatNumber(v)}` : `${formatNumber(v)}`;
}
function formatMul(v: number): string {
  const pct = (v - 1) * 100;
  if (Math.abs(pct) < 0.01) return '×1';
  return `×${v.toFixed(2)} (${pct > 0 ? '+' : ''}${pct.toFixed(0)}%)`;
}
function formatNumber(v: number): string {
  return Math.abs(v) >= 1 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2);
}
function formatTotal(v: number, statId: StatId): string {
  if (statId === 'castSpeed') return v.toFixed(2);
  if (statId === 'critChance') return `${(v * 100).toFixed(1)}%`;
  return Math.round(v).toString();
}
