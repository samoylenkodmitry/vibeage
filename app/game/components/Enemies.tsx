'use client';

import { useGameStore } from '../systems/gameStore';
import { Enemy } from './enemies/Enemy';

export default function Enemies() {
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const selectTarget = useGameStore(state => state.selectTarget);

  // Convert enemies object to array
  const enemiesArray = Object.values(enemies);

  return (
    <group>
      {enemiesArray.map((enemy) => (
        <Enemy 
          key={enemy.id}
          enemy={enemy}
          isSelected={selectedTargetId === enemy.id}
          onSelect={() => selectTarget(enemy.id)}
        />
      ))}
    </group>
  );
}