import { create } from 'zustand';
import { ProjSpawn2, ProjHit2 } from '../../../shared/messages';

type State = { live: Record<string, ProjSpawn2> };
type Actions = {
  add: (p: ProjSpawn2) => void;
  hit: (msg: ProjHit2) => void;
};
export const useProjectileStore = create<State & Actions>((set) => ({
  live: {},
  add: (p) => set((s) => ({ live: { ...s.live, [p.castId]: p } })),
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hit: (h) => set((s) => { const { [h.castId]: _, ...rest } = s.live; return { live: rest }; })
}));
