'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useGameStore } from '../systems/gameStore';
import { SKILLS, Skill, SkillId } from '../models/Skill';
import StatusEffects from './StatusEffects';
import ConnectionStatus from './ConnectionStatus';
import SkillTreeUI from './SkillTreeUI';
import CombatLog from './HUD/CombatLog';
import { GAME_ZONES } from '../systems/zoneSystem';
import Image from 'next/image';
import { tryStartCast } from '../systems/castController';

// Helper function to validate if a string is a valid SkillId
function isValidSkillId(id: string | null): id is SkillId {
  if (!id) return false;
  return id in SKILLS; // Check if the ID exists in the SKILLS object
}


// Add explicit global window typings for our custom method
declare global {
  interface Window {
    castFireball?: () => void;
  }
}

interface SkillButtonProps {
  skill: Skill;
  cooldownEndMs: number; // timestamp in milliseconds when cooldown ends
  isCasting: boolean;
  castProgressMs: number;
  onClick: (event: React.MouseEvent) => void;
  selectedTarget: any;
  isFlashing?: boolean; // Added to handle cast fail visual feedback
}

// Memoize SkillButton to prevent unnecessary re-renders
const SkillButton = React.memo(({ skill, cooldownEndMs, isCasting, castProgressMs, onClick, selectedTarget, isFlashing = false }: SkillButtonProps) => {
  const initial = Math.max(0, cooldownEndMs - Date.now());
  const [remainingCooldownMs, setRemainingCooldownMs] = useState(initial);
  const [castProgress, setCastProgress] = useState(0); // 0-100 percentage of cast completion
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Update cooldown timer
  useEffect(() => {
    const update = () => 
      setRemainingCooldownMs(Math.max(0, cooldownEndMs - Date.now()));
    
    update(); // Update immediately
    if (cooldownEndMs <= Date.now()) return; // Already over
    
    const interval = setInterval(update, 100); // Keep in sync
    
    return () => clearInterval(interval);
  }, [cooldownEndMs]);
  
  // Update cast progress
  useEffect(() => {
    if (!isCasting) {
      setCastProgress(0);
      return;
    }
    
    const updateCastProgress = () => {
      if (skill.castTimeMs <= 0) return; // Instant cast
      
      // Calculate progress percentage (0-100)
      const progress = Math.min(100, (castProgressMs / skill.castTimeMs) * 100);
      setCastProgress(progress);
    };
    
    updateCastProgress();
    const interval = setInterval(updateCastProgress, 50);
    
    return () => clearInterval(interval);
  }, [isCasting, castProgressMs, skill.castTimeMs]);
  
  const isOnCooldown = remainingCooldownMs > 0;
  const isUsable = Boolean(selectedTarget) && !isOnCooldown && !isCasting;
  
  // Handle click with stopPropagation
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUsable) {
      onClick(e);
    }
  }, [isUsable, onClick]);
  
  // Extract debuff effects from the skill
  const debuffEffects = useMemo(() => 
    skill.effects.filter(effect => effect.type !== 'damage' && effect.type !== 'dot'),
    [skill.effects]
  );

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    
    const handleMouseEnter = () => {
      if (isUsable) {
        button.style.transform = 'scale(1.1)';
        button.style.boxShadow = '0 0 10px #9945FF';
      }
    };
    
    const handleMouseLeave = () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = 'none';
    };
    
    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      button.removeEventListener('mouseenter', handleMouseEnter);
      button.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isUsable]);

  // Map skill IDs to their correct image paths
  const getSkillImagePath = (skillId: string) => {
    // Special case mapping for waterSplash which uses the water image
    if (skillId === 'waterSplash') return '/game/skills/skill_water.png';
    return `/game/skills/skill_${skillId}.png`;
  };

  return (
    <div className="flex flex-col items-center">
      <button
        ref={buttonRef}
        className={`relative w-12 h-12 rounded transition-all duration-200 ${
          isFlashing ? 'bg-red-700 ring-2 ring-red-500' :
          isCasting ? 'bg-purple-700 ring-2 ring-purple-300' :
          isOnCooldown ? 'bg-gray-600' : 
          !selectedTarget ? 'bg-gray-500 opacity-50' :
          'bg-gray-800 hover:bg-gray-700'
        } flex items-center justify-center pointer-events-auto focus:outline-none overflow-hidden`}
        onClick={handleClick}
        disabled={!isUsable}
        style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
      >
        {/* Skill icon - using mapped path */}
        <Image 
          src={getSkillImagePath(skill.id)}
          alt={skill.name} 
          width={48}
          height={48}
          className="w-full h-full object-cover"
          onError={(e) => {
            // If image fails to load, show fallback
            if (e.currentTarget.parentElement) {
              e.currentTarget.style.display = 'none';
              // Create a text node with the first letter instead of using innerHTML
              const fallbackText = document.createTextNode(skill.id.charAt(0).toUpperCase());
              e.currentTarget.parentElement.appendChild(fallbackText);
            }
          }}
        />
        
        {/* Cooldown overlay */}
        {isOnCooldown && (
          <>
            <div 
              className="absolute inset-0 bg-gray-800 opacity-70"
              style={{ 
                // Reveal skill icon from top to bottom as cooldown progresses
                clipPath: `inset(${(1 - remainingCooldownMs / skill.cooldownMs) * 100}% 0 0 0)` 
              }}
            ></div>
            <div className="absolute text-white font-bold text-sm">
              {Math.ceil(remainingCooldownMs / 1000)}s
            </div>
          </>
        )}
        
        {/* Casting progress overlay */}
        {isCasting && (
          <>
            <div 
              className="absolute inset-0 bg-purple-600 opacity-70"
              style={{ 
                // Fill from bottom to top as cast progresses
                clipPath: `inset(${100 - castProgress}% 0 0 0)` 
              }}
            ></div>
            <div className="absolute text-white font-bold text-sm">
              {Math.ceil((skill.castTimeMs - castProgressMs) / 1000)}s
            </div>
          </>
        )}
        
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-gray-800 p-2 rounded text-xs text-white opacity-0 hover:opacity-100 transition-opacity z-50 pointer-events-none">
          <div className="font-bold">{skill.name}</div>
          <div className="mt-1">{skill.description}</div>
          <div className="mt-1">Mana: {skill.manaCost}</div>
          <div className="mt-1">Cooldown: {skill.cooldownMs}ms</div>
          {skill.castTimeMs > 0 && <div>Cast Time: {skill.castTimeMs}ms</div>}
          {skill.damage && <div>Damage: {skill.damage}</div>}
          
          {/* Show skill effects in tooltip */}
          {debuffEffects.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-600">
              <div className="font-bold text-yellow-300">Effects:</div>
              <ul className="list-disc list-inside">
                {debuffEffects.map((effect, index) => (
                  <li key={index}>
                    {effect.type.charAt(0).toUpperCase() + effect.type.slice(1)}: 
                    {                    effect.type === 'burn' || effect.type === 'poison' ? 
                      ` ${effect.value}% damage over time` : 
                      effect.type === 'slow' || effect.type === 'waterWeakness' ? 
                      ` ${effect.value}%` : 
                      ` ${effect.value}`}
                    {effect.durationMs ? ` for ${effect.durationMs / 1000}s` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </button>
      
      {/* Debuff effects indicators - icons only, no labels */}
      {debuffEffects.length > 0 && (
        <div className="mt-1 flex space-x-1 justify-center">
          {debuffEffects.map((effect, index) => {
            // Generic emoji mapping for fallbacks (if needed)
            const defaultEmojis: Record<string, string> = {
              default: "⚠️"  // Default fallback
            };
            
            // Generate colored background dynamically based on effect type
            const effectClassName = `effect-${effect.type}`;
            
            return (
              <div
                key={index}
                className={`bg-gray-600 w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white overflow-hidden ${effectClassName}`}
                title={`${effect.type}: ${effect.value}%${effect.durationMs ? ` for ${effect.durationMs / 1000}s` : ''}`}
                style={{
                  // Dynamic background color based on effect type
                  backgroundColor: `var(--effect-${effect.type}-color, #6b7280)`
                }}
              >
                <Image 
                  src={`/game/skills/effect_${effect.type}.png`}
                  alt={effect.type} 
                  width={16}
                  height={16}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // If image fails to load, use first character of effect type
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = defaultEmojis[effect.type] || 
                      effect.type.charAt(0).toUpperCase();
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  return prevProps.skill.id === nextProps.skill.id &&
    prevProps.cooldownEndMs === nextProps.cooldownEndMs &&
    prevProps.isCasting === nextProps.isCasting &&
    prevProps.castProgressMs === nextProps.castProgressMs &&
    prevProps.selectedTarget?.id === nextProps.selectedTarget?.id;
});

SkillButton.displayName = 'SkillButton';

export default React.memo(function UI() {
  const player = useGameStore((state) => state.getMyPlayer());
  const enemies = useGameStore((state) => state.enemies);
  const selectedTargetId = useGameStore((state) => state.selectedTargetId);
  const skillCooldownEndTs = player?.skillCooldownEndTs ?? {};
  const castingSkill = player?.castingSkill ?? null;
  const castingProgressMs = player?.castingProgressMs ?? 0;
  const currentZoneId = useGameStore(state => state.currentZoneId);
  const flashingSkill = useGameStore(state => state.flashingSkill);
  const socket = useGameStore(state => state.socket);
  
  // Check if player is dead
  const isPlayerDead = player && !player.isAlive;

  // Handle resurrection
  const handleResurrect = useCallback((event: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    console.log('Resurrection button clicked, sending respawn request');
    
    if (!socket) {
      console.error('No socket connection available');
      return;
    }
    
    socket.emit('msg', {
      type: 'RespawnRequest',
      id: player?.id,
      clientTs: Date.now()
    });
  }, [socket, player?.id]);
  
  // Memoize selected target lookup
  const selectedTarget = useMemo(() => 
    selectedTargetId ? enemies[selectedTargetId] : null,
    [selectedTargetId, enemies]
  );
  
  // Memoize available skills filtering
  const availableSkills = useMemo(() => {
    if (!player || !player.skillShortcuts) return [];
    
    // Filter out null values and map to skill objects
    return player.skillShortcuts
      .filter(skillId => skillId !== null && isValidSkillId(skillId))
      .map(skillId => SKILLS[skillId as SkillId])
      .filter((skill): skill is Skill => skill !== undefined);
  }, [player?.skillShortcuts]);

  const currentZone = useMemo(() => 
    GAME_ZONES.find(zone => zone.id === currentZoneId),
    [currentZoneId]
  );
  
  const handleSkillClick = useCallback((skillId: string) => (event: React.MouseEvent) => {
    event.stopPropagation();
    
    // Use the unified cast controller
    if (isValidSkillId(skillId)) {
      tryStartCast(skillId, selectedTargetId || undefined);
    } else {
      console.warn(`Invalid skill ID: ${skillId}`);
    }
  }, [selectedTargetId]);

  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Top UI - Target info */}
      {selectedTarget && (
        <div className="absolute top-5 left-1/2 transform -translate-x-1/2 bg-gray-900/80 p-3 rounded-lg flex items-center space-x-4">
          <div className="text-white font-bold">{selectedTarget.name}</div>
          <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-600"
              style={{ width: `${(selectedTarget.health / selectedTarget.maxHealth) * 100}%` }}
            ></div>
          </div>
          <div className="text-white text-sm">
            {selectedTarget.health}/{selectedTarget.maxHealth} HP
          </div>
          {/* Display debuffs on target */}
          <div className="relative pl-2">
            <StatusEffects targetId={selectedTarget.id} position="right" />
          </div>
        </div>
      )}
      
      {/* Bottom UI - Player stats and skills */}
      <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 w-full max-w-3xl px-5">
        {/* Casting Bar */}
        {castingSkill && (
          <div className="mt-3 bg-gray-900/80 p-3 rounded-lg">
            <div className="flex justify-between text-sm text-white mb-1">
              <div>Casting: {SKILLS[castingSkill]?.name}</div>
              <div>{castingProgressMs}ms / {SKILLS[castingSkill]?.castTimeMs}ms</div>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-600"
                style={{ 
                  width: `${(castingProgressMs / SKILLS[castingSkill]?.castTimeMs) * 100}%` 
                }}
              ></div>
            </div>
          </div>
        )}
        {/* Player Info */}
        <div className="bg-gray-900/80 p-3 rounded-lg mb-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-white font-bold">{player?.name || 'Player'} {player?.level || 1}</div>
            <div className="text-gray-300 text-sm">
              XP: {player?.experience || 0}/{player?.experienceToNextLevel || 100}
            </div>
          </div>
          
          {/* Experience Bar */}
          <div className="mb-2">
            <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gray-400"
                style={{ width: `${player?.experience && player?.experienceToNextLevel ? (player.experience / player.experienceToNextLevel) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
          
          {/* Health Bar */}
          <div className="mb-2">
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-600"
                style={{ width: `${player?.health && player?.maxHealth ? (player.health / player.maxHealth) * 100 : 0}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm text-white mt-1">
              <div>HP</div>
              <div>{player ? Math.floor(player.health) : 0}/{player?.maxHealth || 100}</div>
            </div>
          </div>
          
          {/* Mana Bar */}
          <div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full ${useGameStore(state => state.manaBarFlash) ? 'bg-red-600' : 'bg-blue-600'}`}
                style={{ width: `${player?.mana && player?.maxMana ? (player.mana / player.maxMana) * 100 : 0}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm text-white mt-1">
              <div>MP</div>
              <div>{player ? Math.floor(player.mana) : 0}/{player?.maxMana || 100}</div>
            </div>
          </div>
          
          {/* Player status effects */}
          <div className="mt-2">
            <StatusEffects targetId="player" inline={true} />
          </div>
        </div>
        
        {/* Skills */}
        <div className="bg-gray-900/80 p-3 rounded-lg">
          <div className="flex space-x-3">
            {availableSkills.map((skill, index) => (
              <SkillButton 
                key={`${skill.id}-${index}`} // Add index to ensure uniqueness
                skill={skill}
                cooldownEndMs={skillCooldownEndTs[skill.id] || 0}
                isCasting={castingSkill === skill.id}
                castProgressMs={castingProgressMs}
                onClick={handleSkillClick(skill.id)}
                selectedTarget={selectedTarget}
                isFlashing={flashingSkill === skill.id}
              />
            ))}
          </div>
        </div>
        
      </div>

      {/* Zone indicator */}
      <div className="absolute top-4 left-4 bg-black/50 text-white p-4 rounded-lg">
        <h2 className="text-xl font-bold">
          {currentZone?.name || 'Wilderness'}
        </h2>
        {currentZone && (
          <div className="text-sm opacity-80">
            <p>{currentZone.description}</p>
            <p className="mt-1">Level {currentZone.minLevel}-{currentZone.maxLevel}</p>
          </div>
        )}
      </div>
      
      {/* Skill Tree UI */}
      <SkillTreeUI />
      
      {/* Connection status indicator */}
      <ConnectionStatus />

      {/* Combat Log */}
      <CombatLog />
      
      {/* Death Overlay */}
      {isPlayerDead && (
        <div className="fixed inset-0 bg-black/75 z-50 flex flex-col items-center justify-center pointer-events-auto">
          <div className="text-red-500 text-4xl font-bold mb-6">You have died</div>
          <button 
            onClick={(e) => handleResurrect(e)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-lg transition-colors cursor-pointer"
          >
            Resurrect at Home
          </button>
        </div>
      )}
    </div>
  );
});