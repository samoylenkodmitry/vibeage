import { Room, type Client } from '@colyseus/core';
import { ZoneManager } from '../../packages/content/zones.js';
import type { GameState } from '../gameState.js';
import { initWorld } from '../world.js';
import { createSocketBackedAuthoritativeRoom } from './authoritativeRoomAdapter.js';
import { ColyseusAuthoritativeRoomAdapter, makeColyseusOutbound } from './colyseusRoomAdapter.js';
import { sendClientGameStateSnapshot } from './clientSnapshot.js';
import { SOCKET_SESSION_EVENTS } from './roomBoundary.js';
import {
  joinWorldRoomClient,
  leaveWorldRoomClient,
  sendWorldRoomClientSnapshot,
} from './worldRoomLifecycle.js';
import {
  createVibeAgePublicState,
  syncVibeAgePublicState,
  type VibeAgePublicState,
} from './worldStateSchema.js';
import { getPlayerStreamRegionIds, type ServerWorldRegion } from '../world/regions.js';

const MAX_CLIENTS = 200;
const PUBLIC_STATE_SYNC_MS = 1_000;

export class VibeAgeRoom extends Room<{ state: VibeAgePublicState }> {
  private adapter!: ColyseusAuthoritativeRoomAdapter;
  private world!: ReturnType<typeof initWorld>;
  private publicStateTimer: ReturnType<typeof setInterval> | null = null;
  private readonly clientStreamSignatures = new Map<string, string>();

  onCreate(): void {
    this.maxClients = MAX_CLIENTS;
    this.autoDispose = false;
    this.setState(createVibeAgePublicState());

    const outbound = makeColyseusOutbound(this, {
      getGameState: () => this.world?.getGameState(),
      getRegions: () => this.world?.getRegions(),
    });
    this.world = initWorld(outbound, new ZoneManager());
    this.adapter = new ColyseusAuthoritativeRoomAdapter(
      createSocketBackedAuthoritativeRoom(this.world),
    );
    this.syncPublicState();
    this.publicStateTimer = setInterval(() => this.syncPublicState(), PUBLIC_STATE_SYNC_MS);

    this.onMessage(SOCKET_SESSION_EVENTS.message, (client, message) => {
      this.adapter.handleMessage(client, message);
    });
    this.onMessage(SOCKET_SESSION_EVENTS.requestGameState, (client) => {
      this.sendClientSnapshot(client);
    });
  }

  async onJoin(client: Client, options?: unknown): Promise<void> {
    await joinWorldRoomClient<Client>(this, this.adapter, this.world, client, options);
    this.recordClientStreamSignature(client);
    this.syncPublicState({ forceClientSnapshots: true });
  }

  async onLeave(client: Client): Promise<void> {
    await leaveWorldRoomClient<Client>(this, this.adapter, client);
    this.clientStreamSignatures.delete(client.sessionId);
    this.syncPublicState({ forceClientSnapshots: true });
  }

  onDispose(): void {
    if (this.publicStateTimer) {
      clearInterval(this.publicStateTimer);
      this.publicStateTimer = null;
    }
  }

  private sendClientSnapshot(client: Client): void {
    sendWorldRoomClientSnapshot(this.world, client);
    this.recordClientStreamSignature(client);
  }

  private syncPublicState(options: { forceClientSnapshots?: boolean } = {}): void {
    syncVibeAgePublicState(this.state, this.world.getGameState(), this.world.getRegions());
    this.syncClientStreamSnapshots(options.forceClientSnapshots ?? false);
  }

  private syncClientStreamSnapshots(force: boolean): void {
    const state = this.world.getGameState();
    const regions = this.world.getRegions();

    for (const client of this.clients) {
      const signature = getClientStreamSignature(state, regions, client.sessionId);
      if (!force && this.clientStreamSignatures.get(client.sessionId) === signature) {
        continue;
      }

      sendClientGameStateSnapshot(client, state, regions);
      this.clientStreamSignatures.set(client.sessionId, signature);
    }
  }

  private recordClientStreamSignature(client: Client): void {
    this.clientStreamSignatures.set(
      client.sessionId,
      getClientStreamSignature(this.world.getGameState(), this.world.getRegions(), client.sessionId),
    );
  }
}

function getClientStreamSignature(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  sessionId: string,
): string {
  return [...getPlayerStreamRegionIds(state, regions, sessionId)].sort().join('|');
}
