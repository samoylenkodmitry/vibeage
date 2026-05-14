import { Room, type Client } from '@colyseus/core';
import { ZoneManager } from '../../packages/content/zones.js';
import { initWorld } from '../world.js';
import { createSocketBackedAuthoritativeRoom } from './authoritativeRoomAdapter.js';
import { ColyseusAuthoritativeRoomAdapter, makeColyseusOutbound } from './colyseusRoomAdapter.js';
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

const MAX_CLIENTS = 200;
const PUBLIC_STATE_SYNC_MS = 1_000;

export class VibeAgeRoom extends Room<{ state: VibeAgePublicState }> {
  private adapter!: ColyseusAuthoritativeRoomAdapter;
  private world!: ReturnType<typeof initWorld>;
  private publicStateTimer: ReturnType<typeof setInterval> | null = null;

  onCreate(): void {
    this.maxClients = MAX_CLIENTS;
    this.autoDispose = false;
    this.setState(createVibeAgePublicState());

    const outbound = makeColyseusOutbound(this);
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
    this.syncPublicState();
  }

  async onLeave(client: Client): Promise<void> {
    await leaveWorldRoomClient<Client>(this, this.adapter, client);
    this.syncPublicState();
  }

  onDispose(): void {
    if (this.publicStateTimer) {
      clearInterval(this.publicStateTimer);
      this.publicStateTimer = null;
    }
  }

  private sendClientSnapshot(client: Client): void {
    sendWorldRoomClientSnapshot(this.world, client);
  }

  private syncPublicState(): void {
    syncVibeAgePublicState(this.state, this.world.getGameState(), this.world.getRegions());
  }
}
