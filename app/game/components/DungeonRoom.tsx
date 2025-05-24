'use client';

import React, { useMemo } from 'react';
import { DungeonRoom as DungeonRoomType } from '../systems/dungeonSystem';

// Define local interfaces for door and obstacle interactions
interface DungeonDoor {
  direction: string;
  type: 'open' | 'locked' | 'hidden' | 'boss';
  position: { x: number; y: number; z: number };
}

interface DungeonObstacle {
  type: 'wall' | 'pillar' | 'pit' | 'trap' | 'door' | 'chest';
  position: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
}

interface Props {
  room: DungeonRoomType;
  theme: string; // Theme passed from parent dungeon
  onDoorClick?: (door: DungeonDoor) => void;
  onObstacleInteract?: (obstacle: DungeonObstacle) => void;
}

// Room floor component
function RoomFloor({ width, height, theme }: { width: number; height: number; theme: string }) {
  const floorColor = useMemo(() => {
    switch (theme) {
      case 'shadow': return '#2a1810';
      case 'fire': return '#4a1a0a';
      case 'ice': return '#1a2a4a';
      default: return '#3a3a3a';
    }
  }, [theme]);

  return (
    <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color={floorColor} />
    </mesh>
  );
}

// Room walls component
function RoomWalls({ width, height, theme }: { width: number; height: number; theme: string }) {
  const wallColor = useMemo(() => {
    switch (theme) {
      case 'shadow': return '#1a1210';
      case 'fire': return '#3a0f05';
      case 'ice': return '#0f1a3a';
      default: return '#2a2a2a';
    }
  }, [theme]);

  const wallHeight = 4;

  return (
    <group>
      {/* North wall */}
      <mesh position={[0, wallHeight / 2, height / 2]}>
        <boxGeometry args={[width, wallHeight, 0.2]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* South wall */}
      <mesh position={[0, wallHeight / 2, -height / 2]}>
        <boxGeometry args={[width, wallHeight, 0.2]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* East wall */}
      <mesh position={[width / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.2, wallHeight, height]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* West wall */}
      <mesh position={[-width / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.2, wallHeight, height]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
    </group>
  );
}

// Door component
function DoorComponent({ door, onClick }: { door: DungeonDoor; onClick?: (door: DungeonDoor) => void }) {
  const doorColor = useMemo(() => {
    switch (door.type) {
      case 'open': return '#8b4513';
      case 'locked': return '#654321';
      case 'hidden': return '#444444';
      case 'boss': return '#8b0000';
      default: return '#654321';
    }
  }, [door.type]);

  const handleClick = () => {
    if (onClick) onClick(door);
  };

  return (
    <mesh 
      position={[door.position.x, 1, door.position.z]} 
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = door.type === 'open' ? 'pointer' : 'not-allowed';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={[1, 2, 0.2]} />
      <meshStandardMaterial color={doorColor} />
      {door.type === 'locked' && (
        <mesh position={[0, 0, 0.2]}>
          <sphereGeometry args={[0.1]} />
          <meshStandardMaterial color="#ffd700" />
        </mesh>
      )}
      {door.type === 'boss' && (
        <mesh position={[0, 0, 0.2]}>
          <boxGeometry args={[0.3, 0.3, 0.1]} />
          <meshStandardMaterial color="#ff0000" emissive="#330000" />
        </mesh>
      )}
    </mesh>
  );
}

// Obstacle component
function ObstacleComponent({ obstacle, onInteract }: { obstacle: DungeonObstacle; onInteract?: (obstacle: DungeonObstacle) => void }) {
  const obstacleColor = useMemo(() => {
    switch (obstacle.type) {
      case 'pillar': return '#666666';
      case 'wall': return '#4a4a4a';
      case 'chest': return '#8b4513';
      case 'pit': return '#1a1a1a';
      case 'trap': return '#ff4500';
      case 'door': return '#654321';
      default: return '#666666';
    }
  }, [obstacle.type]);

  const handleClick = () => {
    if (onInteract) onInteract(obstacle);
  };

  const getGeometry = () => {
    const { width, height, depth } = obstacle.dimensions;
    switch (obstacle.type) {
      case 'pillar':
        return <cylinderGeometry args={[width / 2, width / 2, height]} />;
      case 'wall':
        return <boxGeometry args={[width, height, depth]} />;
      case 'chest':
        return <boxGeometry args={[width, height, depth]} />;
      case 'pit':
        return <boxGeometry args={[width, height, depth]} />;
      case 'trap':
        return <cylinderGeometry args={[width / 2, width / 2, 0.1]} />;
      case 'door':
        return <boxGeometry args={[width, height, depth]} />;
      default:
        return <boxGeometry args={[width, height, depth]} />;
    }
  };

  const getPosition = () => {
    const baseY = obstacle.position.y + (obstacle.dimensions.height / 2);
    return [obstacle.position.x, baseY, obstacle.position.z] as [number, number, number];
  };

  return (
    <mesh 
      position={getPosition()}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      {getGeometry()}
      <meshStandardMaterial 
        color={obstacleColor} 
        emissive={obstacle.type === 'trap' ? '#331100' : '#000000'}
      />
      {obstacle.type === 'chest' && (
        <mesh position={[0, obstacle.dimensions.height * 0.4, obstacle.dimensions.depth * 0.2]}>
          <boxGeometry args={[obstacle.dimensions.width * 0.8, obstacle.dimensions.height * 0.1, obstacle.dimensions.depth * 0.6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
      )}
    </mesh>
  );
}

// Room lighting based on theme
function RoomLighting({ theme, lighting }: { theme: string; lighting: { color: string; intensity: number } }) {
  const lightColor = lighting.color;
  
  return (
    <group>
      <ambientLight color={lightColor} intensity={lighting.intensity * 0.3} />
      <pointLight 
        position={[0, 3, 0]} 
        color={lightColor} 
        intensity={lighting.intensity} 
        distance={15}
        decay={2}
      />
      {theme === 'fire' && (
        <>
          <pointLight position={[-3, 1, -3]} color="#ff4500" intensity={0.5} distance={8} />
          <pointLight position={[3, 1, 3]} color="#ff6500" intensity={0.5} distance={8} />
        </>
      )}
      {theme === 'ice' && (
        <>
          <pointLight position={[-2, 1, -2]} color="#87ceeb" intensity={0.3} distance={6} />
          <pointLight position={[2, 1, 2]} color="#b0e0e6" intensity={0.3} distance={6} />
        </>
      )}
      {theme === 'shadow' && (
        <pointLight position={[0, 1, 0]} color="#800080" intensity={0.2} distance={10} />
      )}
    </group>
  );
}

export function DungeonRoom({ room, theme, onDoorClick, onObstacleInteract }: Props) {
  const roomWidth = 12;
  const roomHeight = 12;

  // Convert room connections to doors for rendering
  const doors = room.connections.map(connection => ({
    direction: connection.direction,
    type: connection.doorType,
    position: getPositionFromDirection(connection.direction, roomWidth, roomHeight)
  }));

  return (
    <group>
      <RoomFloor width={roomWidth} height={roomHeight} theme={theme} />
      <RoomWalls width={roomWidth} height={roomHeight} theme={theme} />
      <RoomLighting theme={theme} lighting={room.lighting} />
      
      {/* Doors */}
      {doors.map((door, index) => (
        <DoorComponent 
          key={`door-${index}`} 
          door={door} 
          onClick={onDoorClick}
        />
      ))}
      
      {/* Obstacles */}
      {room.obstacles.map((obstacle, index) => (
        <ObstacleComponent 
          key={`obstacle-${index}`} 
          obstacle={obstacle} 
          onInteract={onObstacleInteract}
        />
      ))}
      
      {/* NPCs/Mobs would be rendered here */}
      {room.mobs.map((mob, index) => (
        <mesh key={`mob-${index}`} position={[mob.position.x, 0.5, mob.position.z]}>
          <boxGeometry args={[0.8, 1.6, 0.4]} />
          <meshStandardMaterial color="#8b0000" />
        </mesh>
      ))}
    </group>
  );
}

// Helper function to convert direction to position
function getPositionFromDirection(direction: string, roomWidth: number, roomHeight: number): { x: number; y: number; z: number } {
  switch (direction) {
    case 'north':
      return { x: 0, y: 1, z: roomHeight / 2 };
    case 'south':
      return { x: 0, y: 1, z: -roomHeight / 2 };
    case 'east':
      return { x: roomWidth / 2, y: 1, z: 0 };
    case 'west':
      return { x: -roomWidth / 2, y: 1, z: 0 };
    default:
      return { x: 0, y: 1, z: 0 };
  }
}

export default DungeonRoom;
