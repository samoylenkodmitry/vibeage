'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../systems/gameStore';
import { SKILLS, Skill } from '../models/Skill';

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
  const handleDonationBoost = useCallback((amount: number, duration: number) => {
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
            onClick={() => handleDonationBoost(0.5, 60)}
          >
            +50% (1h) $5
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
            onClick={() => handleDonationBoost(1.0, 120)}
          >
            +100% (2h) $10
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
            onClick={() => handleDonationBoost(2.0, 240)}
          >
            +200% (4h) $20
          </button>
        </div>
      </div>
      
      {/* Admin panel - only visible when isAdmin is true */}
      {isAdmin && (
        <div className="border-t border-gray-700 pt-2">
          <div className="text-white text-xs mb-1">Admin Controls</div>
          <div className="flex gap-2">
            <button
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
              onClick={() => toggleXpEvent(!bonusXpEventActive, 2.0)}
            >
              {bonusXpEventActive ? 'End XP Event' : 'Start XP Event (2x)'}
            </button>
            <button
              className="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2 rounded pointer-events-auto transition-colors"
              onClick={() => clearDonationBoost()}
            >
              Clear Donation Boost
            </button>
          </div>
        </div>
      )}
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
  
  // State to determine if user is admin (for demo purposes)
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Find selected target from enemies array
  const selectedTarget = enemies.find(enemy => enemy.id === selectedTargetId);
  
  // Filter skills based on player level
  const availableSkills = player.skills
    .map(skillId => SKILLS[skillId])
    .filter(skill => skill && player.level >= skill.levelRequired);
  
  // Direct cast handler for when skill buttons are clicked
  const handleSkillClick = (skillId: string) => {
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
  
  // Toggle admin mode on Alt+A keypress
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'a') {
        setIsAdmin(prev => !prev);
        console.log('Admin mode:', !isAdmin);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);
  
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
        </div>
      )}
      
      {/* Right UI - XP Boost Panel */}
      <div className="absolute top-20 right-5 w-64">
        <XPBoostPanel isAdmin={isAdmin} />
      </div>
      
      {/* Bottom UI - Player stats and skills */}
      <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 w-full max-w-3xl px-5">
        {/* Player Info */}
        <div className="bg-gray-900/80 p-3 rounded-lg mb-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-white font-bold">{player.name} (Level {player.level})</div>
            <div className="text-gray-300 text-sm">
              XP: {experience}/{experienceToNextLevel}
            </div>
          </div>
          
          {/* Experience Bar */}
          <div className="mb-2">
            <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-yellow-500"
                style={{ width: `${(experience / experienceToNextLevel) * 100}%` }}
              ></div>
            </div>
          </div>
          
          {/* Health Bar */}
          <div className="mb-2">
            <div className="flex justify-between text-sm text-white mb-1">
              <div>Health</div>
              <div>{Math.floor(player.health)}/{player.maxHealth}</div>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-600"
                style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
              ></div>
            </div>
          </div>
          
          {/* Mana Bar */}
          <div>
            <div className="flex justify-between text-sm text-white mb-1">
              <div>Mana</div>
              <div>{Math.floor(player.mana)}/{player.maxMana}</div>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600"
                style={{ width: `${(player.mana / player.maxMana) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Skills */}
        <div className="bg-gray-900/80 p-3 rounded-lg">
          <div className="text-white font-bold mb-2">Skills</div>
          <div className="flex space-x-3">
            {availableSkills.map((skill) => (
              <SkillButton 
                key={skill.id}
                skill={skill}
                cooldown={skillCooldowns[skill.id] || 0}
                isCasting={castingSkill === skill.id}
                castProgress={castingProgress}
                onClick={() => handleSkillClick(skill.id)}
                selectedTarget={selectedTarget}
              />
            ))}
          </div>
        </div>
        
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
      </div>
    </div>
  );
}

interface SkillButtonProps {
  skill: Skill;
  cooldown: number;
  isCasting: boolean;
  castProgress: number;
  onClick: () => void;
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
  
  return (
    <button
      ref={buttonRef}
      className={`relative w-12 h-12 rounded transition-all duration-200 ${
        isCasting ? 'bg-purple-700 ring-2 ring-purple-300' :
        isOnCooldown ? 'bg-gray-600' : 
        !selectedTarget ? 'bg-gray-500 opacity-50' :
        'bg-gray-800 hover:bg-gray-700'
      } flex items-center justify-center pointer-events-auto focus:outline-none`}
      onClick={isUsable ? onClick : undefined}
      disabled={!isUsable}
      style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
    >
      {/* Placeholder icon */}
      <div className="text-lg text-white">{skill.id.charAt(0).toUpperCase()}</div>
      
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
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-40 bg-gray-800 p-2 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
        <div className="font-bold">{skill.name}</div>
        <div className="mt-1">{skill.description}</div>
        <div className="mt-1">Mana: {skill.manaCost}</div>
        <div>Cooldown: {skill.cooldown}s</div>
        {skill.castTime > 0 && <div>Cast Time: {skill.castTime}s</div>}
        {skill.damage && <div>Damage: {skill.damage}</div>}
      </div>
    </button>
  );
}