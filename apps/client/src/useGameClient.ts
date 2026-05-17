import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import { useClientActions, type ClientActions } from './clientActions';
import { installDevCommands } from './devCommands';
import { installE2EHooks } from './e2eHooks';
import {
  gameClientReducer,
  initialGameClientState,
} from './gameReducer';
import type { GameClientState } from './gameTypes';
import { useRoomConnection } from './roomConnection';

type ClientApi = ClientActions & {
  state: GameClientState;
  connect: (playerName: string) => void;
  disconnect: () => void;
  castSkill: (skillId: SkillId) => void;
  sendMoveIntent: (target: VecXZ) => void;
};

export function useGameClient(): ClientApi {
  const [state, dispatch] = useReducer(gameClientReducer, initialGameClientState);
  const { roomRef, connect, disconnect } = useRoomConnection(dispatch);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const actions = useClientActions(roomRef, stateRef, dispatch);

  useEffect(() => {
    const timer = window.setInterval(() => {
      dispatch({ type: 'pruneCasts', now: Date.now() });
    }, 1_000);

    return () => {
      window.clearInterval(timer);
      roomRef.current?.leave(true).catch(() => undefined);
    };
  }, [roomRef]);

  // Approach-and-cast tick: while a pending cast is queued, poll every
  // ~120ms to check if the player has walked into range. Faster than
  // the 1s prune so the cast fires snappily when the player arrives.
  useEffect(() => {
    const timer = window.setInterval(() => {
      actions.tryFirePendingCast();
    }, 120);
    return () => window.clearInterval(timer);
  }, [actions]);

  useEffect(() => {
    installE2EHooks(state, actions);
  }, [state, actions]);

  useEffect(() => {
    return installDevCommands(actions);
  }, [actions]);

  return useMemo(
    () => ({ state, connect, disconnect, ...actions }),
    [state, connect, disconnect, actions],
  );
}
