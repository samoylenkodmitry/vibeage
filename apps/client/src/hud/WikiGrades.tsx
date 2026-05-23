import { useEffect, useMemo, useRef } from 'react';
import { listGradeSpecs, type GradeSpec } from '../../../../packages/content/equipmentTypes';

/**
 * Wiki Grades tab — surfaces the D/C/B/A/S progression so the
 * player can see at a glance what tier they're looking at on an
 * item tooltip, and what level it'll take to wear the next tier.
 *
 * Reads from `GRADE_SPECS` (the same record the engine consults via
 * `getEffectiveMinLevel` for the equip-gate). Adding a new tier in
 * the spec lights up here automatically; no per-tab registration.
 */
export function GradesTab({
  query, focusId, focusKey,
}: { query: string; focusId: string | null; focusKey: string }) {
  const rows = useMemo(() => listGradeSpecs().filter((g) =>
    matches(`${g.id} ${g.label} ${g.description}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((g) => (
        <GradeLi key={g.id} grade={g} isFocus={g.id === focusId} focusKey={focusKey} />
      ))}
    </ul>
  );
}

function GradeLi({
  grade, isFocus, focusKey,
}: { grade: GradeSpec; isFocus: boolean; focusKey: string }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong style={{ color: grade.color }}>{grade.label}</strong>
        <span className="wiki-row-tag">tier · Lv {grade.minLevel}+</span>
      </header>
      <p>{grade.description}</p>
      <small className="wiki-row-footer">
        Engine equip gate: the player must be at least <strong>Lv {grade.minLevel}</strong> to equip
        anything of this tier (per-item overrides take the higher of the two).
      </small>
    </li>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
