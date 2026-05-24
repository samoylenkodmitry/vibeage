import { describe, expect, it } from 'vitest';
import { formatAiState } from '../apps/client/src/hud/PlatePanels';

/**
 * PR 635 — TargetPanel shows the selected enemy's aiState as a
 * tinted chip. formatAiState maps the server's raw aiState string
 * to a short human label. Unknown states are deliberately passed
 * through (instead of being hidden) so a future server-side AI
 * addition still surfaces in the HUD.
 *
 * These tests pin the mapping so a future renaming of a state
 * label (e.g. 'Chasing' → 'In pursuit') doesn't happen silently
 * — and also pin the pass-through behaviour for unknowns.
 */

describe('formatAiState', () => {
  it("maps 'idle' → 'Idle'", () => {
    expect(formatAiState('idle')).toBe('Idle');
  });
  it("maps 'patrolling' → 'Patrol'", () => {
    expect(formatAiState('patrolling')).toBe('Patrol');
  });
  it("maps 'chasing' → 'Chasing'", () => {
    expect(formatAiState('chasing')).toBe('Chasing');
  });
  it("maps 'attacking' → 'Attacking'", () => {
    expect(formatAiState('attacking')).toBe('Attacking');
  });
  it("maps 'returning' → 'Returning'", () => {
    expect(formatAiState('returning')).toBe('Returning');
  });
  it('passes unknown states through unchanged', () => {
    expect(formatAiState('berserk')).toBe('berserk');
    expect(formatAiState('')).toBe('');
  });
});
