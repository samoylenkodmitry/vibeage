'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../systems/gameStore';
import { SKILLS, Skill } from '../models/Skill';
import StatusEffects from './StatusEffects';
import { GAME_ZONES } from '../systems/zoneSystem';

// Add explicit global window typings for our custom method
declare global {
  interface Window {
    castFireball?: () => void;
  }
}

interface XPBoostPanelProps {
  isAdmin?: boolean;
}

function XPBoostPanel({ isAdmin = false }: XPBoostPanelProps) {
  const getXpMultiplierInfo = useGameStore(state => state.getXpMultiplierInfo);
  const applyDonationBoost = useGameStore(state => state.applyDonationBoost);
  const clearDonationBoost = useGameStore(state => state.clearDonationBoost);
  const toggleXpEvent = useGameStore(state => state.toggleXpEvent);
  const bonusXpEventActive = useGameStore(state => state.bonusXpEventActive);
  const donationXpBoost = useGameStore(state => state.donationXpBoost);
  
  const xpInfo = getXpMultiplierInfo();
  const totalMultiplier = xpInfo.total;
  
  // Handler for donation boost
  const handleDonationBoost = useCallback((amount: number, duration: number, event: React.MouseEvent) => {
    event.stopPropagation();
    applyDonationBoost(amount, duration);
  }, [applyDonationBoost]);
  
  return (
    <div className="bg-gray-900/80 p-3 rounded-lg mb-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-bold">XP Multipliers</h3>
        <div className="text-xl text-yellow-400 font-bold">{totalMultiplier.toFixed(2)}x</div>
      </div>
      
      <div className="space-y-1 mb-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-300">Base Multiplier:</span>
          <span className="text-white">{xpInfo.base}x</span>
        </div>
        
        {xpInfo.donation > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-300">Donation Boost:</span>
            <span className="text-green-400">+{(xpInfo.donation * 100).toFixed(0)}%</span>
          </div>
        )}
        
        {xpInfo.event > 1 && (
          <div className="flex justify-between">
            <span className="text-gray-300">Event Bonus:</span>
            <span className="text-purple-400">{xpInfo.event}x</span>
          </div>
        )}
      </div>
      
      {/* Donation boost panel - visible to all players */}
      <div className="mb-3">
        <div className="flex gap-2 justify-center">
          <button
            className="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
            onClick={(e) => handleDonationBoost(0.5, 60, e)}
          >
            +50% (1h) $5
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
            onClick={(e) => handleDonationBoost(1.0, 120, e)}
          >
            +100% (2h) $10
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
            onClick={(e) => handleDonationBoost(2.0, 240, e)}
          >
            +200% (4h) $20
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UI() {
  const player = useGameStore(state => state.player);
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const experience = useGameStore(state => state.experience);
  const experienceToNextLevel = useGameStore(state => state.experienceToNextLevel);
  const skillCooldowns = useGameStore(state => state.skillCooldowns);
  const castingSkill = useGameStore(state => state.castingSkill);
  const castingProgress = useGameStore(state => state.castingProgress);
  const castSkill = useGameStore(state => state.castSkill);
  
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Find selected target from enemies array
  const selectedTarget = enemies.find(enemy => enemy.id === selectedTargetId);
  
  // Filter skills based on player level
  const availableSkills = player.skills
    .map(skillId => SKILLS[skillId])
    .filter(skill => skill && player.level >= skill.levelRequired);
  
  // Direct cast handler for when skill buttons are clicked
  const handleSkillClick = (skillId: string) => (event: React.MouseEvent) => {
    // Stop event propagation
    event.stopPropagation();
    
    // First try regular skill casting through the game store
    castSkill(skillId);
    
    // If the skill has 0 cast time, also trigger the fireball effect directly
    // This ensures immediate visual feedback 
    if (SKILLS[skillId]?.castTime === 0) {
      // Use the debug function to cast the skill immediately
      if (skillId === 'fireball' && window.castFireball) {
        setTimeout(() => window.castFireball?.(), 50);
      }
    }
  };

  // Get current zone from game store
  const currentZoneId = useGameStore(state => state.currentZoneId);
  const currentZone = GAME_ZONES.find(zone => zone.id === currentZoneId);
  
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
      
      {/* Right UI - XP Boost Panel */}
      <div className="absolute top-20 right-5 w-64">
        <XPBoostPanel isAdmin={isAdmin} />
      </div>
      
      {/* Bottom UI - Player stats and skills */}
      <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 w-full max-w-3xl px-5">
        {/* Casting Bar */}
        {castingSkill && (
          <div className="mt-3 bg-gray-900/80 p-3 rounded-lg">
            <div className="flex justify-between text-sm text-white mb-1">
              <div>Casting: {SKILLS[castingSkill]?.name}</div>
              <div>{castingProgress.toFixed(1)}s / {SKILLS[castingSkill]?.castTime}s</div>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-600"
                style={{ 
                  width: `${(castingProgress / SKILLS[castingSkill]?.castTime) * 100}%` 
                }}
              ></div>
            </div>
          </div>
        )}
        {/* Player Info */}
        <div className="bg-gray-900/80 p-3 rounded-lg mb-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-white font-bold">{player.name} {player.level}</div>
            <div className="text-gray-300 text-sm">
              XP: {experience}/{experienceToNextLevel}
            </div>
          </div>
          
          {/* Experience Bar */}
          <div className="mb-2">
            <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gray-400"
                style={{ width: `${(experience / experienceToNextLevel) * 100}%` }}
              ></div>
            </div>
          </div>
          
          {/* Health Bar */}
          <div className="mb-2">
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-600"
                style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm text-white mt-1">
              <div>HP</div>
              <div>{Math.floor(player.health)}/{player.maxHealth}</div>
            </div>
          </div>
          
          {/* Mana Bar */}
          <div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600"
                style={{ width: `${(player.mana / player.maxMana) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm text-white mt-1">
              <div>MP</div>
              <div>{Math.floor(player.mana)}/{player.maxMana}</div>
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
            {availableSkills.map((skill) => (
              <SkillButton 
                key={skill.id}
                skill={skill}
                cooldown={skillCooldowns[skill.id] || 0}
                isCasting={castingSkill === skill.id}
                castProgress={castingProgress}
                onClick={handleSkillClick(skill.id)}
                selectedTarget={selectedTarget}
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
    </div>
  );
}

interface SkillButtonProps {
  skill: Skill;
  cooldown: number;
  isCasting: boolean;
  castProgress: number;
  onClick: (event: React.MouseEvent) => void;
  selectedTarget: any;
}

function SkillButton({ skill, cooldown, isCasting, castProgress, onClick, selectedTarget }: SkillButtonProps) {
  const [remainingCooldown, setRemainingCooldown] = useState(cooldown);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Update cooldown timer
  useEffect(() => {
    setRemainingCooldown(cooldown);
    
    if (cooldown <= 0) return;
    
    const interval = setInterval(() => {
      setRemainingCooldown(prev => {
        const newValue = Math.max(0, prev - 0.1);
        if (newValue <= 0) {
          clearInterval(interval);
        }
        return newValue;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [cooldown]);
  
  // Check if skill is on cooldown
  const isOnCooldown = remainingCooldown > 0;
  
  // Check if skill is usable (has valid target)
  const isUsable = Boolean(selectedTarget) && !isOnCooldown;
  
  // Handle click with stopPropagation
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUsable) {
      onClick(e);
    }
  };
  
  // Update button style on hover
  useEffect(() => {
    if (!buttonRef.current) return;
    
    const handleMouseEnter = () => {
      if (isUsable) {
        buttonRef.current!.style.transform = 'scale(1.1)';
        buttonRef.current!.style.boxShadow = '0 0 10px #9945FF';
      }
    };
    
    const handleMouseLeave = () => {
      if (buttonRef.current) {
        buttonRef.current.style.transform = 'scale(1)';
        buttonRef.current.style.boxShadow = 'none';
      }
    };
    
    buttonRef.current.addEventListener('mouseenter', handleMouseEnter);
    buttonRef.current.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      if (buttonRef.current) {
        buttonRef.current.removeEventListener('mouseenter', handleMouseEnter);
        buttonRef.current.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [isUsable]);
  
  // Extract debuff effects from the skill
  const debuffEffects = skill.effects.filter(effect => 
    effect.type !== 'damage' && effect.type !== 'dot'
  );

  return (
    <div className="flex flex-col items-center">
      <button
        ref={buttonRef}
        className={`relative w-12 h-12 rounded transition-all duration-200 ${
          isCasting ? 'bg-purple-700 ring-2 ring-purple-300' :
          isOnCooldown ? 'bg-gray-600' : 
          !selectedTarget ? 'bg-gray-500 opacity-50' :
          'bg-gray-800 hover:bg-gray-700'
        } flex items-center justify-center pointer-events-auto focus:outline-none overflow-hidden`}
        onClick={handleClick}
        disabled={!isUsable}
        style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
      >
        {/* Skill icon - using dynamic path */}
        <img 
          src={`/game/skills/skill_${skill.id}.png`}
          alt={skill.name} 
          className="w-full h-full object-cover"
          onError={(e) => {
            // If image fails to load, show fallback
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.innerHTML = skill.id.charAt(0).toUpperCase();
          }}
        />
        
        {/* Cooldown overlay */}
        {isOnCooldown && (
          <>
            <div 
              className="absolute inset-0 bg-gray-800 opacity-70"
              style={{ 
                clipPath: `inset(${(1 - remainingCooldown / skill.cooldown) * 100}% 0 0 0)` 
              }}
            ></div>
            <div className="absolute text-white font-bold text-sm">
              {remainingCooldown.toFixed(1)}
            </div>
          </>
        )}
        
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-gray-800 p-2 rounded text-xs text-white opacity-0 hover:opacity-100 transition-opacity z-50 pointer-events-none">
          <div className="font-bold">{skill.name}</div>
          <div className="mt-1">{skill.description}</div>
          <div className="mt-1">Mana: {skill.manaCost}</div>
          <div>Cooldown: {skill.cooldown}s</div>
          {skill.castTime > 0 && <div>Cast Time: {skill.castTime}s</div>}
          {skill.damage && <div>Damage: {skill.damage}</div>}
          
          {/* Show skill effects in tooltip */}
          {debuffEffects.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-600">
              <div className="font-bold text-yellow-300">Effects:</div>
              <ul className="list-disc list-inside">
                {debuffEffects.map((effect, index) => (
                  <li key={index}>
                    {effect.type.charAt(0).toUpperCase() + effect.type.slice(1)}: 
                    {effect.type === 'burn' || effect.type === 'poison' ? 
                      ` ${effect.value}% damage over time` : 
                      effect.type === 'slow' || effect.type === 'waterWeakness' ? 
                      ` ${effect.value}%` : 
                      ` ${effect.value}`}
                    {effect.duration ? ` for ${effect.duration}s` : ''}
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
                title={`${effect.type}: ${effect.value}%${effect.duration ? ` for ${effect.duration}s` : ''}`}
                style={{
                  // Dynamic background color based on effect type
                  backgroundColor: `var(--effect-${effect.type}-color, #6b7280)`
                }}
              >
                <img 
                  src={`/game/skills/effect_${effect.type}.png`}
                  alt={effect.type} 
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
}