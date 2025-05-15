/**
 * Helper function to wrap socket.io's emit to prevent accidental use of legacy messages
 * Used for verification in tests that legacy messages are not emitted
 */
import { Server } from 'socket.io';

export function assertNoLegacyEmit(io: Server): void {
  const originalEmit = io.emit;
  
  io.emit = function(event: string, ...args: any[]) {
    // Check for forbidden event types
    if (event === 'skillEffect') {
      throw new Error(`Forbidden legacy event emitted: ${event}`);
    }
    
    if (event === 'msg') {
      const msg = args[0];
      if (msg && (msg.type === 'ProjSpawn2' || msg.type === 'ProjHit2')) {
        throw new Error(`Forbidden legacy message type emitted: ${msg.type}`);
      }
    }
    
    return originalEmit.apply(this, [event, ...args]);
  };
}
