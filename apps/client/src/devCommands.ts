import type { VecXZ } from '../../../packages/protocol/messages';
import type { ClientActions } from './clientActions';

declare global {
  interface Window {
    __vibeageDevTeleport?: (x: number, z: number) => void;
  }
}

const noop = () => undefined;

export function installDevCommands(api: ClientActions): () => void {
  if (!import.meta.env.DEV) {
    return noop;
  }

  window.__vibeageDevTeleport = (x: number, z: number) => {
    const target: VecXZ = { x, z };
    api.devTeleport(target);
    console.info(`[vibeage] dev teleport requested: ${x}, ${z}`);
  };

  return () => {
    delete window.__vibeageDevTeleport;
  };
}
