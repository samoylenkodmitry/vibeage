'use client';

import { useGameStore, StatusEffect } from '../systems/gameStore';
import Image from 'next/image';
import { useState, useEffect } from 'react';

interface StatusEffectsProps {
  targetId: string | 'player';
  position?: 'top' | 'right' | 'bottom' | 'left';
  inline?: boolean;
}

export default function StatusEffects({ targetId, position = 'top', inline = false }: StatusEffectsProps) {
  const getStatusEffects = useGameStore(state => state.getStatusEffects);
  const [effects, setEffects] = useState<StatusEffect[]>([]);

  // Update effects when they change in the game store
  useEffect(() => {
    const updateEffects = () => {
      const currentEffects = getStatusEffects(targetId);
      setEffects([...currentEffects]);
    };

    // Initial update
    updateEffects();

    // Setup interval to periodically check for updated effects
    const intervalId = setInterval(updateEffects, 500);
    return () => clearInterval(intervalId);
  }, [targetId, getStatusEffects]);

  if (effects.length === 0) return null;

  // Format to show time remaining
  const formatTimeRemaining = (effect: StatusEffect) => {
    const currentTime = Date.now();
    const elapsedTime = (currentTime - effect.startTime) / 1000;
    const remainingTime = Math.max(0, effect.duration - elapsedTime);
    return remainingTime.toFixed(1);
  };

  // Get position classes
  const getPositionClasses = () => {
    if (inline) return "flex flex-wrap gap-1";
    
    switch(position) {
      case 'top': return "absolute -top-7 left-1/2 transform -translate-x-1/2 flex gap-1";
      case 'bottom': return "absolute -bottom-7 left-1/2 transform -translate-x-1/2 flex gap-1";
      case 'left': return "absolute top-1/2 -left-7 transform -translate-y-1/2 flex flex-col gap-1";
      case 'right': return "absolute top-1/2 -right-7 transform -translate-y-1/2 flex flex-col gap-1";
      default: return "absolute -top-7 left-1/2 transform -translate-x-1/2 flex gap-1";
    }
  };

  return (
    <div className={getPositionClasses()}>
      {effects.map(effect => {
        const effectClassName = `effect-${effect.type}`;
        
        return (
          <div 
            key={effect.id} 
            className={`bg-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white relative overflow-hidden ${effectClassName}`}
            title={`${effect.type}: ${effect.value}% - ${formatTimeRemaining(effect)}s remaining`}
            style={{
              // Set background color through CSS variable, fall back to a gray
              backgroundColor: `var(--effect-${effect.type}-color, #6b7280)`
            }}
          >
            <img 
              src={`/game/skills/effect_${effect.type}.png`} 
              alt={effect.type} 
              className="w-full h-full object-cover"
              onError={(e) => {
                // If image fails to load, use the first letter of the effect type
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = effect.type.charAt(0).toUpperCase();
              }}
            />
            {/* Show only the timer without text labels */}
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-[10px] bg-black/50 px-1 rounded">
              {formatTimeRemaining(effect)}
            </div>
          </div>
        );
      })}
    </div>
  );
}