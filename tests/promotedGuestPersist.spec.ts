import { describe, expect, it, vi } from 'vitest';

// Carry-forward durability: if the Become row insert fails (DB hiccup), the
// pending flag must stay set so the next persist retries — the trial progress
// is never silently dropped.

const insertMock = vi.fn();
vi.mock('../server/persistence/playerRepository', () => ({
  playerRepository: {
    insertPlayerForAccount: (...args: unknown[]) => insertMock(...args),
    updatePlayer: vi.fn(),
    upsertSession: vi.fn(),
    insertServerEvent: vi.fn(),
  },
}));

const { createTransientPlayer } = await import('../server/playerFactory');
const { persistPlayer, promotePendingGuest } = await import('../server/persistence');

describe('promoted-guest persistence', () => {
  it('inserts the row, sets persistentId, and clears the pending flag on success', async () => {
    insertMock.mockResolvedValueOnce({ id: 'row-1' });
    const player = createTransientPlayer('sock', 'Arin', { guest: true });
    player.accountId = 'acct-1';
    player.pendingPersistentInsert = true;

    await promotePendingGuest(player);

    expect(insertMock).toHaveBeenCalledWith('acct-1', 'Arin', expect.any(Object));
    expect(player.persistentId).toBe('row-1');
    expect(player.pendingPersistentInsert).toBe(false);
  });

  it('keeps the pending flag set when the insert fails, and a later persist retries', async () => {
    insertMock.mockReset();
    insertMock.mockRejectedValueOnce(new Error('db down'));
    const player = createTransientPlayer('sock2', 'Arin', { guest: true });
    player.accountId = 'acct-1';
    player.pendingPersistentInsert = true;

    await promotePendingGuest(player);
    expect(player.persistentId).toBeUndefined();
    expect(player.pendingPersistentInsert).toBe(true);

    // The persist loop retries the insert; this time it lands.
    insertMock.mockResolvedValueOnce({ id: 'row-2' });
    await persistPlayer(player);
    expect(player.persistentId).toBe('row-2');
    expect(player.pendingPersistentInsert).toBe(false);
  });
});
