// Test the PosDelta compression in a simple scenario

import { CM_PER_UNIT, POS_MAX_DELTA_CM } from '../shared/netConstants';
import { VecXZ, PosDelta, PosSnap } from '../shared/messages';

// Mock player position and last sent position
const playerPos: VecXZ = { x: 10, z: 15 };
const lastSentPos: VecXZ = { x: 9.93, z: 15.05 };

// Calculate deltas in cm
const dx = Math.round((playerPos.x - lastSentPos.x) * CM_PER_UNIT); // Should be 7
const dz = Math.round((playerPos.z - lastSentPos.z) * CM_PER_UNIT); // Should be -5

console.log(`Position deltas: dx=${dx}cm, dz=${dz}cm`);

// Create PosDelta message
const posDelta: PosDelta = {
  type: 'PosDelta',
  id: 'player-123',
  dx,
  dz,
  serverTs: Date.now()
};

console.log('PosDelta message:', posDelta);

// Simulate client-side reconstruction
const reconstructedPos: VecXZ = {
  x: lastSentPos.x + dx / CM_PER_UNIT,
  z: lastSentPos.z + dz / CM_PER_UNIT
};

console.log('Original position:', playerPos);
console.log('Reconstructed position:', reconstructedPos);
console.log('Error:', {
  x: playerPos.x - reconstructedPos.x,
  z: playerPos.z - reconstructedPos.z
});

// Test overflow condition
const farPos: VecXZ = { x: 400, z: 200 }; // 400m away on x-axis (40,000cm)
const dx2 = Math.round((farPos.x - lastSentPos.x) * CM_PER_UNIT);
const dz2 = Math.round((farPos.z - lastSentPos.z) * CM_PER_UNIT);

console.log(`Far position deltas: dx=${dx2}cm, dz=${dz2}cm`);
console.log(`Exceeds int16 limit (${POS_MAX_DELTA_CM}): ${Math.abs(dx2) > POS_MAX_DELTA_CM}`);

// In this case, we'd fall back to a full PosSnap
const posSnap: PosSnap = {
  type: 'PosSnap',
  id: 'player-123',
  pos: farPos,
  serverTs: Date.now()
};

console.log('Fallback PosSnap message:', posSnap);
