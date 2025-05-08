'use client';

import React, { useCallback, useMemo } from 'react';
import { useGameStore, StatusEffect } from '../systems/gameStore';
import Image from 'next/image';

interface StatusEffectsProps {
  targetId: string | 'player';
  position?: 'top' | 'right' | 'bottom' | 'left';
  inline?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StatusEffects = React.memo(React.forwardRef<HTMLDivElement, StatusEffectsProps>(({ targetId, position = 'top', inline = false }, ref) => {
  // Format to show time remaining
  const formatTimeRemainingMs = useCallback((effect: StatusEffect) => {
    const currentTimeMs = Date.now();
    const elapsedTimeMs = currentTimeMs - effect.startTimeTs;
    const remainingTimeMs = Math.max(0, effect.durationMs - elapsedTimeMs);
    // Return actual millisecond value for precise display
    return remainingTimeMs;
  }, []);

  // Get position classes
  const getPositionClasses = useCallback(() => {
    if (inline) return "flex flex-wrap gap-1";
    
    switch(position) {
      case 'top': return "absolute -top-7 left-1/2 transform -translate-x-1/2 flex gap-1";
      case 'bottom': return "absolute -bottom-7 left-1/2 transform -translate-x-1/2 flex gap-1";
      case 'left': return "absolute top-1/2 -left-7 transform -translate-y-1/2 flex flex-col gap-1";
      case 'right': return "absolute top-1/2 -right-7 transform -translate-y-1/2 flex flex-col gap-1";
      default: return "absolute -top-7 left-1/2 transform -translate-x-1/2 flex gap-1";
    }
  }, [inline, position]);

  // Create a stable memoized selector to avoid infinite loops
  const selectEffects = useMemo(() => {
    // Cache for the last result to compare with shallow equality
    let lastResult: StatusEffect[] = [];
    
    // Return a selector function that's stable across renders
    return (state: any) => {
      let newResult: StatusEffect[];
      
      if (targetId === 'player') {
        const pid = state.myPlayerId;
        newResult = pid ? state.players[pid]?.statusEffects ?? [] : [];
      } else {
        newResult = state.enemies[targetId]?.statusEffects ?? [];
      }
      
      // Only update the reference if the content has changed
      // This is a simple shallow comparison - checks if arrays have the same items
      const hasChanged = 
        lastResult.length !== newResult.length || 
        newResult.some((effect, i) => effect !== lastResult[i]);
      
      if (hasChanged) {
        lastResult = newResult;
      }
      
      return lastResult;
    };
  }, [targetId]);
  
  // Use the memoized selector with the store
  const effects = useGameStore(selectEffects);
  
  if (effects.length === 0) return null;

  return (
    <div className={getPositionClasses()}>
      {effects.map((effect: StatusEffect) => {
        const effectClassName = `effect-${effect.type}`;
        
        return (
          <div 
            key={effect.id} 
            className={`bg-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white relative overflow-hidden ${effectClassName}`}
            title={`${effect.type}: ${effect.value}% - ${formatTimeRemainingMs(effect)}ms remaining`}
            style={{
              backgroundColor: `var(--effect-${effect.type}-color, #6b7280)`
            }}
          >
            <Image 
              src={`/game/skills/effect_${effect.type}.png`} 
              width={24}
              height={24}
              alt={effect.type} 
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = effect.type.charAt(0).toUpperCase();
              }}
            />
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-[10px] bg-black/50 px-1 rounded">
              {formatTimeRemainingMs(effect)}ms
            </div>
          </div>
        );
      })}
    </div>
  );
}));

StatusEffects.displayName = 'StatusEffects';

export default StatusEffects;