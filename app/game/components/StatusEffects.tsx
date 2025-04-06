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

  // Get icon based on effect type
  const getEffectIcon = (effect: StatusEffect) => {
    // Use custom icons if provided
    if (effect.icon) {
      return effect.icon;
    }

    // Fallback to simple colored backgrounds based on effect type
    switch (effect.type) {
      case 'burn':
        return "🔥";
      case 'poison':
        return "☠️";
      case 'slow':
        return "🐢";
      case 'freeze':
        return "❄️";
      case 'stun':
        return "⚡";
      case 'transform':
        return "🗿";
      case 'waterWeakness':
        return "💧";
      default:
        return "⚠️";
    }
  };

  // Get background color based on effect type
  const getEffectColor = (effect: StatusEffect) => {
    switch (effect.type) {
      case 'burn':
        return "bg-red-700";
      case 'poison':
        return "bg-green-700";
      case 'slow':
        return "bg-blue-700";
      case 'freeze':
        return "bg-blue-400";
      case 'stun':
        return "bg-yellow-600";
      case 'transform':
        return "bg-gray-700";
      case 'waterWeakness':
        return "bg-cyan-700";
      default:
        return "bg-purple-700";
    }
  };

  return (
    <div className={getPositionClasses()}>
      {effects.map(effect => (
        <div 
          key={effect.id} 
          className={`${getEffectColor(effect)} w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white relative`}
          title={`${effect.type}: ${effect.value}% - ${formatTimeRemaining(effect)}s remaining`}
        >
          <div>{getEffectIcon(effect)}</div>
          <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-[10px] bg-black/50 px-1 rounded">
            {formatTimeRemaining(effect)}s
          </div>
        </div>
      ))}
    </div>
  );
}