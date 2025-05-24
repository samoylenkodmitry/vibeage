'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../systems/gameStore';
// Import getSkillById from the correct path using shared definitions
import { SKILLS as skillsDefinitionShared, SkillId as SkillIdShared } from '../../../shared/skillsDefinition';

interface CastingBarProps {
  playerId: string;
}

// Helper to get skill by ID using the shared definition
const getSkillById = (skillId: string | null | undefined): typeof skillsDefinitionShared[SkillIdShared] | null => {
  if (!skillId) return null;
  // Ensure SKILLS has the skillId as a key and it's a valid SkillIdShared
  if (Object.prototype.hasOwnProperty.call(skillsDefinitionShared, skillId)) {
    return skillsDefinitionShared[skillId as SkillIdShared] || null;
  }
  return null;
};

export default function CastingBar({ playerId }: CastingBarProps) {
  const player = useGameStore((state) => 
    playerId ? state.players[playerId] : null
  );
  
  const [progressPercentInternal, setProgressPercentInternal] = useState(0);
  const [skillName, setSkillName] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  // Use a ref to track current progress without triggering re-renders
  const currentProgressMsRef = useRef(0);
  
  useEffect(() => {
    if (!player) {
      setIsVisible(false);
      currentProgressMsRef.current = 0;
      setProgressPercentInternal(0); // Ensure reset
      return;
    }
    
    const isCurrentlyCasting = !!player.castingSkill;
    const currentCastingSkillId = player.castingSkill;
    
    if (isCurrentlyCasting && currentCastingSkillId) {
      const skill = getSkillById(currentCastingSkillId);
      if (skill) {
        // THIS IS THE KEY CHANGE: Always reset local progress based on store when cast starts/changes
        const serverProgressMs = player.castingProgressMs || 0;
        currentProgressMsRef.current = serverProgressMs;
        
        const castTimeMs = skill.castMs || 1000;
        // Calculate initial progress based on what the server says (should be 0 for new casts)
        const initialProgressPercent = Math.min(100, (serverProgressMs / castTimeMs) * 100);
        
        setProgressPercentInternal(initialProgressPercent);
        setSkillName(skill.name || currentCastingSkillId);
        setIsVisible(true);
      } else {
        setIsVisible(false); // Skill definition not found
        currentProgressMsRef.current = 0;
        setProgressPercentInternal(0);
      }
    } else {
      setIsVisible(false);
      currentProgressMsRef.current = 0;
      setProgressPercentInternal(0);
    }
  }, [player?.castingSkill, player?.castingProgressMs, player]); // player dependency is important
  
  useEffect(() => {
    if (!isVisible || !player?.castingSkill) return;

    const castingSkillId = player.castingSkill;
    const skill = getSkillById(castingSkillId);
    if (!skill) return;

    const castTimeMs = skill.castMs || 1000;

    const interval = setInterval(() => {
      // Use the ref value directly
      const prevMs = currentProgressMsRef.current;
      const newMs = prevMs + 50; // Increment local progress
      
      currentProgressMsRef.current = newMs;
      
      if (newMs >= castTimeMs) {
        setProgressPercentInternal(100);
        // Server will eventually clear player.castingSkill, which will hide the bar via the other useEffect
        currentProgressMsRef.current = castTimeMs;
      } else {
        const newProgressPercent = Math.min(100, (newMs / castTimeMs) * 100);
        setProgressPercentInternal(newProgressPercent);
      }
    }, 100); // Increased from 50ms to 100ms for better performance
    
    return () => clearInterval(interval);
  }, [isVisible, player?.castingSkill]); 
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 w-64 bg-gray-800 border border-purple-600 rounded-md p-2 shadow-lg">
      <div className="flex justify-between items-center mb-1">
        <div className="text-white text-sm font-semibold">{skillName}</div>
        <div className="text-white text-xs">{Math.round(progressPercentInternal)}%</div>
      </div>
      <div className="h-4 bg-gray-700 rounded-sm overflow-hidden">
        <div 
          className="h-full bg-purple-600 transition-all duration-50 ease-linear"
          style={{ width: `${progressPercentInternal}%` }}
        ></div>
      </div>
    </div>
  );
}
