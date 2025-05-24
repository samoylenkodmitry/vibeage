'use client';

import { RigidBody } from '@react-three/rapier';
import { useRef, memo, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { useGameStore } from '../systems/gameStore';
import { GAME_ZONES } from '../systems/zoneSystem';
import * as THREE from 'three';
import Loot from './Loot';

// Optimize the Loot component with memo to prevent unnecessary re-renders
const MemoizedLoot = memo(Loot);

// Resource Node Components for gathering systems
const MiningNode = memo<{ position?: [number, number, number]; oreType?: string; size?: number }>(function MiningNode({ 
  position = [0, 0, 0], 
  oreType = 'iron', 
  size = 1 
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Subtle pulsing animation
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(size + Math.sin(clock.getElapsedTime()) * 0.1);
    }
  });

  const getOreColor = (type: string) => {
    switch (type) {
      case 'iron': return '#8B8B8B';
      case 'gold': return '#FFD700';
      case 'crystal': return '#E6E6FA';
      case 'mithril': return '#B0E0E6';
      default: return '#8B8B8B';
    }
  };

  return (
    <mesh 
      ref={meshRef}
      position={position} 
      userData={{ interactive: true, type: 'mining_node', oreType }}
    >
      <octahedronGeometry args={[0.8, 1]} />
      <meshStandardMaterial 
        color={getOreColor(oreType)} 
        metalness={0.8}
        roughness={0.2}
        emissive={getOreColor(oreType)}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
});

const HerbalismNode = memo<{ position?: [number, number, number]; herbType?: string }>(function HerbalismNode({ 
  position = [0, 0, 0], 
  herbType = 'common_herb'
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Gentle swaying animation
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.5) * 0.1;
    }
  });

  const getHerbColor = (type: string) => {
    switch (type) {
      case 'common_herb': return '#32CD32';
      case 'mystical_flower': return '#9370DB';
      case 'fire_blossom': return '#FF4500';
      case 'ice_root': return '#87CEEB';
      case 'shadow_moss': return '#2F4F4F';
      default: return '#32CD32';
    }
  };

  return (
    <group position={position}>
      <mesh 
        ref={meshRef}
        userData={{ interactive: true, type: 'herbalism_node', herbType }}
      >
        <coneGeometry args={[0.3, 1.2, 6]} />
        <meshStandardMaterial 
          color={getHerbColor(herbType)}
          roughness={0.6}
        />
      </mesh>
      {/* Flower top for some herb types */}
      {(herbType === 'mystical_flower' || herbType === 'fire_blossom') && (
        <mesh position={[0, 1, 0]}>
          <sphereGeometry args={[0.2, 8, 6]} />
          <meshStandardMaterial 
            color={herbType === 'mystical_flower' ? '#DDA0DD' : '#FF6347'}
            emissive={herbType === 'mystical_flower' ? '#DDA0DD' : '#FF6347'}
            emissiveIntensity={0.4}
          />
        </mesh>
      )}
    </group>
  );
});

// Dungeon Portal Component
const DungeonPortal = memo<{ position?: [number, number, number]; dungeonId?: string; size?: number }>(function DungeonPortal({ 
  position = [0, 0, 0], 
  dungeonId = 'shadow_dungeon',
  size = 2 
}) {
  const portalRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  
  useFrame(({ clock }) => {
    if (portalRef.current) {
      portalRef.current.rotation.y += 0.01;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y -= 0.02;
      innerRef.current.scale.setScalar(size + Math.sin(clock.getElapsedTime() * 2) * 0.2);
    }
  });

  const getPortalColor = (id: string) => {
    switch (id) {
      case 'shadow_dungeon': return '#800080';
      case 'fire_caverns': return '#FF4500';
      case 'ice_temple': return '#87CEEB';
      case 'void_rift': return '#000080';
      default: return '#800080';
    }
  };

  return (
    <group position={position}>
      {/* Outer ring */}
      <mesh ref={portalRef} userData={{ interactive: true, type: 'dungeon_portal', dungeonId }}>
        <torusGeometry args={[size, 0.3, 8, 16]} />
        <meshStandardMaterial 
          color={getPortalColor(dungeonId)}
          emissive={getPortalColor(dungeonId)}
          emissiveIntensity={0.8}
        />
      </mesh>
      {/* Inner swirling effect */}
      <mesh ref={innerRef}>
        <circleGeometry args={[size * 0.8, 16]} />
        <meshStandardMaterial 
          color={getPortalColor(dungeonId)}
          transparent
          opacity={0.6}
          emissive={getPortalColor(dungeonId)}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
});

// Ancient Rune Stone Component
const RuneStone = memo<{ position?: [number, number, number]; runeType?: string }>(function RuneStone({ 
  position = [0, 0, 0], 
  runeType = 'power' 
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.5 + Math.sin(clock.getElapsedTime()) * 0.3;
    }
  });

  const getRuneColor = (type: string) => {
    switch (type) {
      case 'power': return '#FF0000';
      case 'wisdom': return '#0000FF';
      case 'nature': return '#00FF00';
      case 'shadow': return '#800080';
      default: return '#FF0000';
    }
  };

  return (
    <mesh 
      ref={meshRef}
      position={position}
      userData={{ interactive: true, type: 'rune_stone', runeType }}
    >
      <cylinderGeometry args={[0.8, 1.2, 2.5, 6]} />
      <meshStandardMaterial 
        color="#696969"
        emissive={getRuneColor(runeType)}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
});

export default function World() {
  const terrainRef = useRef<THREE.Mesh>(null);
  const updatePlayerZone = useGameStore(state => state.updatePlayerZone);
  // Subscribe to groundLoot changes
  const groundLoot = useGameStore(state => state.groundLoot);
  
  // Update player's current zone
  useFrame(() => {
    updatePlayerZone();
  });
  
  return (
    <>
      {/* Ground - Expanded to 10x size */}
      <RigidBody type="fixed" colliders="trimesh">
        <mesh 
          ref={terrainRef} 
          position={[0, -0.5, 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          receiveShadow
          userData={{ groundPlane: true }}
        >
          <planeGeometry args={[1000, 1000, 64, 64]} />
          <meshStandardMaterial 
            color="#3a7e4c" 
            roughness={0.8}
            side={THREE.DoubleSide} // Render both sides to ensure visibility
          />
        </mesh>
      </RigidBody>
      
      {/* Zone Markers */}
      {GAME_ZONES.map(zone => (
        <group key={zone.id}>
          {/* Zone boundary indicator - semi-transparent circle */}
          <mesh 
            position={[zone.position.x, 0.1, zone.position.z]} 
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[zone.radius, 32]} />
            <meshBasicMaterial 
              color={getZoneColor(zone.id)} 
              transparent 
              opacity={0.1} 
            />
          </mesh>
          
          {/* Zone name text - Raised higher and made smaller */}
          <Billboard 
            position={[zone.position.x, 8, zone.position.z]}
            follow={true}
            lockX={false}
            lockY={false}
            lockZ={false}
          >
            <Text
              color="white"
              fontSize={3}
              outlineWidth={0.3}
              outlineColor="black"
              textAlign="center"
              material-transparent
              material-opacity={0.7}
            >
              {zone.name}
              {`\nLevel ${zone.minLevel}-${zone.maxLevel}`}
            </Text>
          </Billboard>
        </group>
      ))}
      
      {/* Ground Loot Items - Render outside of zone loop for proper subscription */}
      {Object.entries(groundLoot).map(([lootId, lootData]) => (
        <MemoizedLoot 
          key={lootId} 
          lootId={lootId} 
          position={lootData.position} 
          items={lootData.items} 
        />
      ))}
      
      {/* Environmental Objects */}
      <group>
        {/* Distribute environmental objects based on zones */}
        {GAME_ZONES.map(zone => (
          <group key={`env-${zone.id}`}>
            {zone.id === 'dark_forest' && (
              <Forest 
                position={[zone.position.x, 0, zone.position.z]} 
                count={50} 
                spread={zone.radius * 0.8} 
              />
            )}
            
            {zone.id === 'rocky_highlands' && (
              <>
                <Rocks 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={20} 
                  spread={zone.radius * 0.7} 
                />
                <BoulderField 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={15} 
                  spread={zone.radius * 0.6} 
                />
              </>
            )}
            
            {zone.id === 'misty_lake' && (
              <>
                <mesh 
                  position={[zone.position.x, -0.2, zone.position.z]} 
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <circleGeometry args={[zone.radius * 0.6, 32]} />
                  <meshStandardMaterial 
                    color="#0077be" 
                    transparent 
                    opacity={0.8} 
                  />
                </mesh>
                <Bushes 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={30} 
                  spread={zone.radius * 0.8} 
                />
              </>
            )}
            
            {zone.id === 'starter_meadow' && (
              <>
                <Forest 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={20} 
                  spread={zone.radius * 0.7} 
                />
                <Bushes 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={40} 
                  spread={zone.radius * 0.8} 
                />
                <FallenLogs 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={8} 
                  spread={zone.radius * 0.6} 
                />
              </>
            )}
            
            {zone.id === 'volcanic_wastes' && (
              <>
                <LavaFlows 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={12} 
                  spread={zone.radius * 0.8} 
                />
                <VolcanicRocks 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={25} 
                  spread={zone.radius * 0.9} 
                />
              </>
            )}
            
            {zone.id === 'frozen_tundra' && (
              <>
                <IceBoulders 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={20} 
                  spread={zone.radius * 0.7} 
                />
                <FrozenTrees 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={15} 
                  spread={zone.radius * 0.6} 
                />
              </>
            )}
            
            {zone.id === 'ethereal_gardens' && (
              <>
                <FloatingRocks 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={18} 
                  spread={zone.radius * 0.8} 
                />
                <MagicalTrees 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={25} 
                  spread={zone.radius * 0.9} 
                />
              </>
            )}
            
            {zone.id === 'cursed_ruins' && (
              <>
                <Rocks 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={15} 
                  spread={zone.radius * 0.6} 
                />
                <BoulderField 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={10} 
                  spread={zone.radius * 0.7} 
                />
              </>
            )}
            
            {zone.id === 'crystal_caverns' && (
              <>
                <CrystalFormations 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={25} 
                  spread={zone.radius * 0.7} 
                />
              </>
            )}
            
            {zone.id === 'temporal_rifts' && (
              <>
                <TemporalAnomaly 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={8} 
                  spread={zone.radius * 0.6} 
                />
                <DistortedTerrain 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={12} 
                  spread={zone.radius * 0.8} 
                />
              </>
            )}
            
            {/* Resource Gathering Nodes */}
            {zone.id === 'volcanic_wastes' && (
              <>
                <MiningNode position={[zone.position.x + 30, 0, zone.position.z + 20]} oreType="fire_gem" />
                <MiningNode position={[zone.position.x - 25, 0, zone.position.z - 15]} oreType="iron" />
                <HerbalismNode position={[zone.position.x + 10, 0, zone.position.z - 30]} herbType="fire_blossom" />
              </>
            )}
            
            {zone.id === 'frozen_tundra' && (
              <>
                <MiningNode position={[zone.position.x + 40, 0, zone.position.z + 10]} oreType="mithril" />
                <HerbalismNode position={[zone.position.x - 20, 0, zone.position.z + 35]} herbType="ice_root" />
                <HerbalismNode position={[zone.position.x + 15, 0, zone.position.z - 25]} herbType="ice_root" />
              </>
            )}
            
            {zone.id === 'ethereal_gardens' && (
              <>
                <HerbalismNode position={[zone.position.x + 25, 0, zone.position.z + 15]} herbType="mystical_flower" />
                <HerbalismNode position={[zone.position.x - 30, 0, zone.position.z - 10]} herbType="mystical_flower" />
                <MiningNode position={[zone.position.x + 5, 0, zone.position.z + 40]} oreType="crystal" />
                <RuneStone position={[zone.position.x, 0, zone.position.z]} runeType="nature" />
              </>
            )}
            
            {zone.id === 'abyssal_depths' && (
              <>
                <MiningNode position={[zone.position.x + 50, 0, zone.position.z + 30]} oreType="crystal" />
                <HerbalismNode position={[zone.position.x - 40, 0, zone.position.z + 20]} herbType="shadow_moss" />
                <RuneStone position={[zone.position.x + 20, 0, zone.position.z - 35]} runeType="shadow" />
                <DungeonPortal position={[zone.position.x, 0, zone.position.z]} dungeonId="void_rift" />
              </>
            )}
            
            {zone.id === 'celestial_peaks' && (
              <>
                <MiningNode position={[zone.position.x + 35, 0, zone.position.z + 25]} oreType="gold" />
                <RuneStone position={[zone.position.x - 20, 0, zone.position.z + 30]} runeType="power" />
                <RuneStone position={[zone.position.x + 10, 0, zone.position.z - 20]} runeType="wisdom" />
                <DungeonPortal position={[zone.position.x, 0, zone.position.z]} dungeonId="sky_temple" />
              </>
            )}
            
            {zone.id === 'crystal_caverns' && (
              <>
                <MiningNode position={[zone.position.x + 20, 0, zone.position.z + 15]} oreType="crystal" />
                <MiningNode position={[zone.position.x - 25, 0, zone.position.z - 20]} oreType="crystal" />
                <MiningNode position={[zone.position.x + 10, 0, zone.position.z - 35]} oreType="mithril" />
              </>
            )}
            
            {zone.id === 'dragon_peaks' && (
              <>
                <MiningNode position={[zone.position.x + 40, 0, zone.position.z + 20]} oreType="gold" />
                <MiningNode position={[zone.position.x - 30, 0, zone.position.z + 25]} oreType="iron" />
                <DungeonPortal position={[zone.position.x, 0, zone.position.z]} dungeonId="fire_caverns" />
              </>
            )}
            
            {zone.id === 'shadow_valley' && (
              <>
                <HerbalismNode position={[zone.position.x + 25, 0, zone.position.z + 15]} herbType="shadow_moss" />
                <HerbalismNode position={[zone.position.x - 20, 0, zone.position.z - 25]} herbType="shadow_moss" />
                <RuneStone position={[zone.position.x + 5, 0, zone.position.z]} runeType="shadow" />
                <DungeonPortal position={[zone.position.x - 10, 0, zone.position.z + 30]} dungeonId="shadow_dungeon" />
              </>
            )}
            
            {zone.id === 'starter_meadow' && (
              <>
                <HerbalismNode position={[zone.position.x + 30, 0, zone.position.z + 20]} herbType="common_herb" />
                <HerbalismNode position={[zone.position.x - 25, 0, zone.position.z - 15]} herbType="common_herb" />
                <MiningNode position={[zone.position.x + 40, 0, zone.position.z - 30]} oreType="iron" />
              </>
            )}
          </group>
        ))}
      </group>
    </>
  );
}

// Helper function to get color for zone visualization
function getZoneColor(zoneId: string): string {
  const colors: { [key: string]: string } = {
    starter_meadow: '#90EE90',      // Light green
    dark_forest: '#228B22',         // Forest green
    rocky_highlands: '#A0522D',     // Brown
    misty_lake: '#4682B4',          // Steel blue
    cursed_ruins: '#800080',        // Purple
    dragon_peaks: '#FF4500',        // Red-Orange
    shadow_valley: '#483D8B',       // Dark slate blue
    crystal_caverns: '#00CED1',     // Turquoise
    volcanic_wastes: '#DC143C',     // Crimson red
    frozen_tundra: '#B0E0E6',       // Powder blue
    ethereal_gardens: '#DA70D6',    // Orchid
    abyssal_depths: '#191970',      // Midnight blue
    celestial_peaks: '#FFD700',     // Gold
    temporal_rifts: '#8A2BE2'       // Blue violet
  };
  return colors[zoneId] || '#FFFFFF';
}

// Helper component to create a forest with customizable spread - Memoized to prevent re-creation
const Forest = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 40 }) => {
  // Use stable tree positions based on position and count
  const trees = useMemo(() => {
    // Use position as seed for consistent tree placement
    const seed = position[0] + position[2] + count;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      // Create deterministic "random" positions based on seed
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.0;
      
      result.push(
        <Tree key={`tree-${i}`} position={[x, position[1], z]} scale={scale} />
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{trees}</group>;
});

Forest.displayName = 'Forest';

// Simple tree component - Made slightly larger
function Tree({ position = [0, 0, 0], scale = 1 }) {
  return (
    <group position={[position[0], position[1], position[2]]} scale={scale}>
      {/* Tree trunk */}
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.4, 2]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      
      {/* Tree foliage */}
      <mesh position={[0, 3, 0]} castShadow>
        <coneGeometry args={[1.5, 3, 8]} />
        <meshStandardMaterial color="#2e8b57" />
      </mesh>
    </group>
  );
}

// Rock formation component with customizable spread - Memoized
const Rocks = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 3, spread = 20 }) => {
  const rocks = useMemo(() => {
    const seed = position[0] + position[2] + count + 1000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.5;
      
      result.push(
        <RigidBody key={`rock-${i}`} type="fixed" position={[x, position[1], z]}>
          <mesh castShadow>
            <dodecahedronGeometry args={[scale, 0]} />
            <meshStandardMaterial color="#808080" roughness={0.8} />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{rocks}</group>;
});

Rocks.displayName = 'Rocks';

// Larger boulders with more diverse shapes - Memoized
const BoulderField = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 30 }) => {
  const boulders = useMemo(() => {
    const seed = position[0] + position[2] + count + 2000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      const pseudoRandom5 = Math.sin(seed + i * 53.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 2.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 2.5;
      const rotationY = (pseudoRandom4 - Math.floor(pseudoRandom4)) * Math.PI * 2;
      const shape = Math.floor((pseudoRandom5 - Math.floor(pseudoRandom5)) * 3);
      
      result.push(
        <RigidBody key={`boulder-${i}`} type="fixed" position={[x, position[1] + scale/3, z]}>
          <mesh castShadow rotation={[(pseudoRandom1 - Math.floor(pseudoRandom1)) * 0.3, rotationY, (pseudoRandom2 - Math.floor(pseudoRandom2)) * 0.3]}>
            {shape === 0 && <icosahedronGeometry args={[scale, 0]} />}
            {shape === 1 && <octahedronGeometry args={[scale, 0]} />}
            {shape === 2 && <boxGeometry args={[scale, scale * 0.7, scale * 0.9]} />}
            <meshStandardMaterial color="#615e5d" roughness={0.9} />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{boulders}</group>;
});

BoulderField.displayName = 'BoulderField';

// Bushes and small vegetation - Memoized
const Bushes = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const bushes = useMemo(() => {
    const seed = position[0] + position[2] + count + 3000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      const pseudoRandom5 = Math.sin(seed + i * 53.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 0.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.0;
      const rotationY = (pseudoRandom4 - Math.floor(pseudoRandom4)) * Math.PI * 2;
      const colorVariation = (pseudoRandom5 - Math.floor(pseudoRandom5)) * 0.2;
      
      const greenHue = 0.3 + (pseudoRandom1 - Math.floor(pseudoRandom1)) * 0.1;
      const color = `rgb(${Math.floor((0.15 + colorVariation) * 255)}, 
                        ${Math.floor((greenHue + colorVariation) * 255)}, 
                        ${Math.floor((0.15 + colorVariation) * 255)})`;
      
      result.push(
        <group key={`bush-${i}`} position={[x, position[1], z]} rotation={[0, rotationY, 0]} scale={scale}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <sphereGeometry args={[0.8, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0.4, 0.6, 0.4]} castShadow>
            <sphereGeometry args={[0.6, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[-0.4, 0.5, 0.2]} castShadow>
            <sphereGeometry args={[0.7, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </group>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{bushes}</group>;
});

Bushes.displayName = 'Bushes';

// Fallen logs scattered in the forest - Memoized
const FallenLogs = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 30 }) => {
  const logs = useMemo(() => {
    const seed = position[0] + position[2] + count + 4000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      const pseudoRandom5 = Math.sin(seed + i * 53.719) * 43758.5453;
      const pseudoRandom6 = Math.sin(seed + i * 67.341) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scaleX = 0.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 0.3;
      const scaleZ = 0.5 + (pseudoRandom4 - Math.floor(pseudoRandom4)) * 0.3;
      const length = 3 + (pseudoRandom5 - Math.floor(pseudoRandom5)) * 5;
      const rotationY = (pseudoRandom6 - Math.floor(pseudoRandom6)) * Math.PI * 2;
      
      result.push(
        <RigidBody key={`log-${i}`} type="fixed" position={[x, position[1], z]}>
          <group rotation={[0, rotationY, (pseudoRandom1 - Math.floor(pseudoRandom1)) * 0.3 - 0.15]}>
            {/* Log body */}
            <mesh position={[0, 0.5 * scaleZ, 0]} castShadow>
              <cylinderGeometry args={[scaleX, scaleX, length, 8]} />
              <mesh rotation={[0, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#654321" roughness={0.9} />
            </mesh>
            
            {/* End caps */}
            <mesh position={[length/2, 0.5 * scaleZ, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <circleGeometry args={[scaleX, 8]} />
              <meshStandardMaterial color="#5a3a1a" roughness={0.95} />
            </mesh>
            
            <mesh position={[-length/2, 0.5 * scaleZ, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
              <circleGeometry args={[scaleX, 8]} />
              <meshStandardMaterial color="#5a3a1a" roughness={0.95} />
            </mesh>
          </group>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{logs}</group>;
});

FallenLogs.displayName = 'FallenLogs';

// Lava flows for volcanic areas - Memoized
const LavaFlows = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 10, spread = 30 }) => {
  const lavaFlows = useMemo(() => {
    const seed = position[0] + position[2] + count + 5000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const width = 2 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 3;
      
      result.push(
        <mesh key={`lava-${i}`} position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, width * 2]} />
          <meshStandardMaterial 
            color="#FF4500" 
            emissive="#FF2200"
            emissiveIntensity={0.8}
            transparent 
            opacity={0.9} 
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{lavaFlows}</group>;
});

LavaFlows.displayName = 'LavaFlows';

// Volcanic rocks - Memoized
const VolcanicRocks = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const rocks = useMemo(() => {
    const seed = position[0] + position[2] + count + 6000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 2.0;
      
      result.push(
        <RigidBody key={`vrock-${i}`} type="fixed" position={[x, position[1] + scale/2, z]}>
          <mesh castShadow>
            <dodecahedronGeometry args={[scale, 0]} />
            <meshStandardMaterial 
              color="#8B0000" 
              emissive="#330000"
              emissiveIntensity={0.3}
              roughness={0.9} 
            />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{rocks}</group>;
});

VolcanicRocks.displayName = 'VolcanicRocks';

// Ice boulders for frozen tundra - Memoized
const IceBoulders = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const boulders = useMemo(() => {
    const seed = position[0] + position[2] + count + 7000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 2.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 3.0;
      
      result.push(
        <RigidBody key={`ice-${i}`} type="fixed" position={[x, position[1] + scale/2, z]}>
          <mesh castShadow>
            <icosahedronGeometry args={[scale, 0]} />
            <meshStandardMaterial 
              color="#B0E0E6" 
              transparent
              opacity={0.8}
              roughness={0.1}
              metalness={0.1}
            />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{boulders}</group>;
});

IceBoulders.displayName = 'IceBoulders';

// Frozen trees - Memoized
const FrozenTrees = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 10, spread = 30 }) => {
  const trees = useMemo(() => {
    const seed = position[0] + position[2] + count + 8000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 0.8;
      
      result.push(
        <group key={`ftree-${i}`} position={[x, position[1], z]} scale={scale}>
          <mesh position={[0, 1, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.4, 2]} />
            <meshStandardMaterial color="#4682B4" />
          </mesh>
          <mesh position={[0, 3, 0]} castShadow>
            <coneGeometry args={[1.5, 3, 8]} />
            <meshStandardMaterial color="#E0FFFF" />
          </mesh>
        </group>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{trees}</group>;
});

FrozenTrees.displayName = 'FrozenTrees';

// Floating rocks for ethereal gardens - Memoized
const FloatingRocks = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const rocks = useMemo(() => {
    const seed = position[0] + position[2] + count + 9000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const y = 3 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 4;
      const scale = 1.0 + (pseudoRandom4 - Math.floor(pseudoRandom4)) * 1.5;
      
      result.push(
        <mesh key={`frock-${i}`} position={[x, y, z]} castShadow>
          <octahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial 
            color="#DA70D6" 
            emissive="#8A2BE2"
            emissiveIntensity={0.3}
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{rocks}</group>;
});

FloatingRocks.displayName = 'FloatingRocks';

// Magical trees for ethereal gardens - Memoized
const MagicalTrees = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const trees = useMemo(() => {
    const seed = position[0] + position[2] + count + 10000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.2 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 0.8;
      
      result.push(
        <group key={`mtree-${i}`} position={[x, position[1], z]} scale={scale}>
          <mesh position={[0, 1, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.4, 2]} />
            <meshStandardMaterial 
              color="#DDA0DD" 
              emissive="#9370DB"
              emissiveIntensity={0.2}
            />
          </mesh>
          <mesh position={[0, 3, 0]} castShadow>
            <coneGeometry args={[1.5, 3, 8]} />
            <meshStandardMaterial 
              color="#FF69B4"
              emissive="#FF1493"
              emissiveIntensity={0.3}
            />
          </mesh>
        </group>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{trees}</group>;
});

MagicalTrees.displayName = 'MagicalTrees';

// Underwater ruins for abyssal depths - Memoized
const UnderwaterRuins = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 10, spread = 30 }) => {
  const ruins = useMemo(() => {
    const seed = position[0] + position[2] + count + 11000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const height = 2 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 4;
      const width = 1 + (pseudoRandom4 - Math.floor(pseudoRandom4)) * 2;
      
      result.push(
        <RigidBody key={`ruin-${i}`} type="fixed" position={[x, position[1] + height/2, z]}>
          <mesh castShadow>
            <boxGeometry args={[width, height, width]} />
            <meshStandardMaterial 
              color="#2F4F4F" 
              roughness={1.0}
            />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{ruins}</group>;
});

UnderwaterRuins.displayName = 'UnderwaterRuins';

// Dark corals - Memoized
const DarkCorals = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 20, spread = 30 }) => {
  const corals = useMemo(() => {
    const seed = position[0] + position[2] + count + 12000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 0.8 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.2;
      
      result.push(
        <mesh key={`coral-${i}`} position={[x, position[1] + scale/2, z]} castShadow>
          <coneGeometry args={[scale * 0.6, scale * 1.5, 6]} />
          <meshStandardMaterial 
            color="#483D8B"
            emissive="#191970"
            emissiveIntensity={0.2}
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{corals}</group>;
});

DarkCorals.displayName = 'DarkCorals';

// Crystal formations for celestial peaks - Memoized
const CrystalFormations = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const crystals = useMemo(() => {
    const seed = position[0] + position[2] + count + 13000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 2.0;
      
      result.push(
        <mesh key={`crystal-${i}`} position={[x, position[1] + scale, z]} castShadow>
          <octahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial 
            color="#FFD700"
            emissive="#FFA500"
            emissiveIntensity={0.5}
            transparent
            opacity={0.8}
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{crystals}</group>;
});

CrystalFormations.displayName = 'CrystalFormations';

// Light pillars for celestial peaks - Memoized
const LightPillars = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 30 }) => {
  const pillars = useMemo(() => {
    const seed = position[0] + position[2] + count + 14000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const height = 8 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 6;
      
      result.push(
        <mesh key={`pillar-${i}`} position={[x, position[1] + height/2, z]}>
          <cylinderGeometry args={[0.3, 0.3, height]} />
          <meshStandardMaterial 
            color="#FFFFFF"
            emissive="#FFD700"
            emissiveIntensity={1.0}
            transparent
            opacity={0.7}
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{pillars}</group>;
});

LightPillars.displayName = 'LightPillars';

// Temporal anomalies for temporal rifts - Memoized
const TemporalAnomaly = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 8, spread = 30 }) => {
  const anomalies = useMemo(() => {
    const seed = position[0] + position[2] + count + 15000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.5;
      
      result.push(
        <mesh key={`anomaly-${i}`} position={[x, position[1] + 2, z]}>
          <torusGeometry args={[scale, scale * 0.3, 8, 16]} />
          <meshStandardMaterial 
            color="#8A2BE2"
            emissive="#9370DB"
            emissiveIntensity={0.8}
            transparent
            opacity={0.6}
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{anomalies}</group>;
});

TemporalAnomaly.displayName = 'TemporalAnomaly';

// Distorted terrain for temporal rifts - Memoized
const DistortedTerrain = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 10, spread = 30 }) => {
  const terrain = useMemo(() => {
    const seed = position[0] + position[2] + count + 16000;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const y = (pseudoRandom3 - Math.floor(pseudoRandom3) - 0.5) * 4;
      const scale = 1.5 + (pseudoRandom4 - Math.floor(pseudoRandom4)) * 2.0;
      
      result.push(
        <mesh key={`distorted-${i}`} position={[x, position[1] + y, z]}>
          <tetrahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial 
            color="#4B0082"
            wireframe={true}
            transparent
            opacity={0.7}
          />
        </mesh>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{terrain}</group>;
});

DistortedTerrain.displayName = 'DistortedTerrain';
