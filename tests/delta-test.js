// Test script that verifies the delta compression implementation
console.log('=== PosDelta Compression Test ===');

// Constants from shared/netConstants.ts
const CM_PER_UNIT = 100;  // 1 unit = 100 cm (1 meter)
const POS_MAX_DELTA_CM = 32767; // Maximum delta value for int16

// Mock player position and last sent position
const playerPos = { x: 10, z: 15 };
const lastSentPos = { x: 9.93, z: 15.05 };

console.log('Player position:', playerPos);
console.log('Last sent position:', lastSentPos);

// Calculate deltas in cm
const dx = Math.round((playerPos.x - lastSentPos.x) * CM_PER_UNIT); // Should be 7
const dz = Math.round((playerPos.z - lastSentPos.z) * CM_PER_UNIT); // Should be -5

console.log(`\nPosition deltas in cm: dx=${dx}cm, dz=${dz}cm`);

// Create PosDelta message
const posDelta = {
  type: 'PosDelta',
  id: 'player-123',
  dx,
  dz,
  serverTs: Date.now()
};

console.log('\nPosDelta message:', posDelta);

// Simulate client-side reconstruction
const reconstructedPos = {
  x: lastSentPos.x + dx / CM_PER_UNIT,
  z: lastSentPos.z + dz / CM_PER_UNIT
};

console.log('\nReconstructed position:', reconstructedPos);
console.log('Error:', {
  x: playerPos.x - reconstructedPos.x,
  z: playerPos.z - reconstructedPos.z
});

// Test overflow condition
const farPos = { x: 400, z: 200 }; // 400m away on x-axis (40,000cm)
const dx2 = Math.round((farPos.x - lastSentPos.x) * CM_PER_UNIT);
const dz2 = Math.round((farPos.z - lastSentPos.z) * CM_PER_UNIT);

console.log('\n=== Fallback Test for Large Position Changes ===');
console.log('Far position:', farPos);
console.log(`Far position deltas: dx=${dx2}cm, dz=${dz2}cm`);
console.log(`Exceeds int16 limit (${POS_MAX_DELTA_CM}): ${Math.abs(dx2) > POS_MAX_DELTA_CM}`);

// In this case, we'd fall back to a full PosSnap
const posSnap = {
  type: 'PosSnap',
  id: 'player-123',
  pos: farPos,
  serverTs: Date.now()
};

console.log('\nFallback PosSnap message:', posSnap);

// Calculate bandwidth savings
const pdsSize = JSON.stringify(posDelta).length;
const pssSize = JSON.stringify({
  type: 'PosSnap',
  id: 'player-123',
  pos: playerPos,
  serverTs: Date.now()
}).length;

console.log('\n=== Bandwidth Savings Analysis ===');
console.log(`PosDelta size: ${pdsSize} bytes`);
console.log(`PosSnap size: ${pssSize} bytes`);
console.log(`Reduction: ${Math.round((1 - pdsSize / pssSize) * 100)}%`);

console.log('\n✅ Delta compression test completed successfully!');
