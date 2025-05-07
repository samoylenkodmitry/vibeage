'use client';

import React, { useCallback } from 'react';
import { useGameStore, StatusEffect } from '../systems/gameStore';
import Image from 'next/image';

interface StatusEffectsProps {
  targetId: string | 'player';
  position?: 'top' | 'right' | 'bottom' | 'left';
  inline?: boolean;
}

// EXTREMELY simple hook for status effects with debugging
function useStatusEffects(targetId: string | 'player'): StatusEffect[] {
  // Add component instance identifier for tracking render cycles
  const instanceId = React.useRef(`${targetId}-${Math.random().toString(36).substring(2, 7)}`);
  
  console.log(`[DEBUG][StatusEffects][${instanceId.current}] Hook initializing for target: ${targetId}`);
  
  // Initialize with empty array instead of calling getter directly
  const [effects, setEffects] = React.useState<StatusEffect[]>([]);
  
  // Create a stable getter function that will always retrieve the latest effects
  const effectsGetter = useCallback(() => {
    const state = useGameStore.getState();
    
    if (targetId === 'player') {
      const playerId = state.myPlayerId;
      if (!playerId) {
        console.log(`[DEBUG][StatusEffects][${instanceId.current}] No player ID found in state`);
        return [];
      }
      const player = state.players[playerId];
      if (!player) {
        console.log(`[DEBUG][StatusEffects][${instanceId.current}] Player with ID ${playerId} not found in state`);
        return [];
      }
      return player?.statusEffects || [];
    } else {
      const enemy = state.enemies[targetId];
      if (!enemy) {
        console.log(`[DEBUG][StatusEffects][${instanceId.current}] Enemy with ID ${targetId} not found in state`);
        return [];
      }
      return enemy?.statusEffects || [];
    }
  }, [targetId, instanceId]);
  
  // Set up a simple interval to update the effects
  React.useEffect(() => {
    console.log(`[DEBUG][StatusEffects][${instanceId.current}] Effect setup for target: ${targetId}`);
    
    let isMounted = true;
    
    // Update immediately on mount
    try {
      const initialEffects = effectsGetter();
      console.log(`[DEBUG][StatusEffects][${instanceId.current}] Initial effects:`, initialEffects);
      if (isMounted) {
        setEffects(initialEffects);
      }
    } catch (err) {
      console.error(`[ERROR][StatusEffects][${instanceId.current}] Error getting initial effects:`, err);
    }
    
    // Update effects on a timer to avoid excessive re-renders
    const intervalId = setInterval(() => {
      try {
        if (isMounted) {
          const newEffects = effectsGetter();
          
          // Only update if there's a meaningful change
          const hasChanged = newEffects.length !== effects.length || 
            newEffects.some((effect, idx) => 
              !effects[idx] || effect.id !== effects[idx].id || 
              effect.durationMs !== effects[idx].durationMs);
          
          if (hasChanged) {
            console.log(`[DEBUG][StatusEffects][${instanceId.current}] Updating effects:`, newEffects);
            setEffects(newEffects);
          }
        }
      } catch (err) {
        console.error(`[ERROR][StatusEffects][${instanceId.current}] Error updating effects:`, err);
      }
    }, 1000); // Once per second is enough for effects display
    
    return () => {
      isMounted = false;
      clearInterval(intervalId);
      console.log(`[DEBUG][StatusEffects][${instanceId.current}] Cleanup for target: ${targetId}`);
    };
  }, [targetId, effectsGetter, instanceId, effects.length]);
  
  return effects;
}

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

  // Use the custom hook to get effects - this separates the store logic from the component
  const effects = useStatusEffects(targetId);
  
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