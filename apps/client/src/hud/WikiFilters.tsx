import type { ReactNode } from 'react';

/**
 * Reusable wiki list toolbar — filter chips + sort selector + count.
 * Wiki tabs that have a meaningful number of entries (Items, Skills,
 * Mobs, etc.) thread their per-domain filter/sort options through
 * this so every tab gets the same affordances without each one
 * re-implementing the UI.
 */

export type WikiFilterChip = {
  id: string;
  label: string;
  /** When true, only entries that satisfy this chip's predicate are kept. */
  active: boolean;
  /** Optional tint for category chips (e.g. grade colors). */
  color?: string;
};

export type WikiSortOption = {
  id: string;
  label: string;
};

export function WikiFilters({
  chips, onToggleChip, onResetChips,
  sortOptions, sortId, onSortChange,
  count, total,
  extra,
}: {
  chips?: WikiFilterChip[];
  onToggleChip?: (id: string) => void;
  onResetChips?: () => void;
  sortOptions?: WikiSortOption[];
  sortId?: string;
  onSortChange?: (id: string) => void;
  count: number;
  total: number;
  extra?: ReactNode;
}) {
  const anyActive = chips?.some((c) => c.active) ?? false;
  return (
    <div className="wiki-filters">
      {chips && chips.length > 0 && (
        <div className="wiki-filters-chips" role="group" aria-label="Filters">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`wiki-filter-chip${c.active ? ' wiki-filter-chip--on' : ''}`}
              aria-pressed={c.active}
              onClick={() => onToggleChip?.(c.id)}
              style={c.color ? { borderColor: c.color, color: c.active ? '#0b1014' : c.color, background: c.active ? c.color : 'transparent' } : undefined}
            >
              {c.label}
            </button>
          ))}
          {anyActive && onResetChips && (
            <button type="button" className="wiki-filter-chip wiki-filter-chip--reset" onClick={onResetChips}>
              Clear
            </button>
          )}
        </div>
      )}
      <div className="wiki-filters-meta">
        {sortOptions && sortOptions.length > 0 && (
          <label className="wiki-filter-sort">
            <span>Sort</span>
            <select
              value={sortId ?? sortOptions[0]?.id}
              onChange={(e) => onSortChange?.(e.target.value)}
            >
              {sortOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        <span className="wiki-filter-count" aria-live="polite">
          {count === total ? `${count}` : `${count} of ${total}`}
        </span>
        {extra}
      </div>
    </div>
  );
}
