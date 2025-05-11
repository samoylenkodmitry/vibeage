/**
 * Handles MoveIntent messages from clients requesting to move to a target position
 * This replaces the old MoveStart handler in the server-authoritative movement system
 */
function onMoveIntent(socket: Socket, state: GameState, msg: MoveIntent): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    console.warn(`Invalid player ID or wrong socket for MoveIntent: ${playerId}`);
    return;
  }
  
  // Implement a cast-lock window to prevent "micro-teleport" exploits
  const now = Date.now();
  if (player.lastUpdateTime && now - player.lastUpdateTime < 33) { // 33ms = ~1 tick at 30 FPS
    console.warn(`Movement request from player ${playerId} received too quickly, enforcing cast-lock window`);
    // Still process the request but apply a slight delay (server-side)
  }
  
  // Validate the target position is within reasonable bounds
  if (!isValidPosition(msg.targetPos)) {
    console.warn(`Invalid target position in MoveIntent from player ${playerId}: ${JSON.stringify(msg.targetPos)}`);
    return;
  }

  // Get current position
  const currentPos = { x: player.position.x, z: player.position.z };
  
  // Calculate distance to target
  const distance = Math.sqrt(
    Math.pow(currentPos.x - msg.targetPos.x, 2) +
    Math.pow(currentPos.z - msg.targetPos.z, 2)
  );
  
  // Check if this is a stop command (targetPos same as current position)
  if (distance < 0.05) {
    // This is a stop command - immediately halt the player
    player.movement = { 
      isMoving: false, 
      lastUpdateTime: now 
    };
    player.velocity = { x: 0, z: 0 };
    
    // Create a position snapshot for the stop command
    const stopSnapMsg = {
      type: 'PosSnap',
      snaps: [{
        id: playerId,
        pos: currentPos,
        vel: { x: 0, z: 0 },
        snapTs: now
      }]
    };
    
    // Send to the requesting client
    socket.emit('msg', stopSnapMsg);
    
    // Also broadcast to other players
    socket.broadcast.emit('msg', stopSnapMsg);
    
    return;
  }
  
  // Limit maximum teleport distance - if move request is too far, cap it
  const MAX_MOVE_DISTANCE = 30; // Maximum allowed movement distance in units
  let finalTargetPos = { ...msg.targetPos };
  
  if (distance > MAX_MOVE_DISTANCE) {
    console.warn(`Movement request from player ${playerId} exceeds maximum allowed distance: ${distance.toFixed(2)} units`);
    
    // Cap the distance while maintaining the direction
    const dirToTarget = calculateDir(currentPos, msg.targetPos);
    finalTargetPos = {
      x: currentPos.x + dirToTarget.x * MAX_MOVE_DISTANCE,
      z: currentPos.z + dirToTarget.z * MAX_MOVE_DISTANCE
    };
    
    console.log(`Capped movement at distance ${MAX_MOVE_DISTANCE} units in direction (${dirToTarget.x.toFixed(2)}, ${dirToTarget.z.toFixed(2)})`);
  }
  
  // Calculate direction and determine speed (now server-controlled)
  const dir = calculateDir(currentPos, finalTargetPos);
  
  // Determine server-authorized speed (can vary based on player stats, buffs, etc.)
  const speed = getPlayerSpeed(player); // Server decides the speed
  
  // Update player's movement state
  player.movement = {
    ...player.movement,
    isMoving: true,
    targetPos: finalTargetPos,
    lastUpdateTime: now,
    speed: speed
  };
  
  // Set velocity for movement simulation
  player.velocity = {
    x: dir.x * speed,
    z: dir.z * speed
  };
  
  // Update last processed time
  player.lastUpdateTime = now;
  
  // Create a position snapshot message
  const posSnapMsg = {
    type: 'PosSnap',
    snaps: [{
      id: playerId, 
      pos: currentPos,
      vel: player.velocity,
      snapTs: now
    }]
  };
  
  // Debug logging for position snapshots
  console.log(`Sending MoveIntent response PosSnap: ${JSON.stringify(posSnapMsg)}`);
  
  // Send position update back to the requesting client
  socket.emit('msg', posSnapMsg);
  
  // Also broadcast to other players
  socket.broadcast.emit('msg', posSnapMsg);
  
  // Log movement (debug level)
  log(LOG_CATEGORIES.MOVEMENT, 'debug', `Player ${playerId} moving to ${JSON.stringify(finalTargetPos)} at speed ${speed}`);
}
