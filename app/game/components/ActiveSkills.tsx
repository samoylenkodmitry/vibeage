'use client';

import { useEffect } from 'react';
import { useGameStore } from '../systems/gameStore';
import { tryStartCast } from '../systems/castController';

/**
 * ActiveSkills component
 * 
 * This component:
 * 1. Sets up keyboard shortcuts for casting skills
 * 2. Doesn't render any visual elements itself
 * 3. VFX for skills are handled by the VfxManager component
 */
export default function ActiveSkills() {
  // Use a more stable selection from the store
  const myPlayerId = useGameStore(state => state.myPlayerId);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  
  // Setup keyboard shortcuts for casting skills
  useEffect(() => {
    // Fireball casting
    window.castFireball = () => {
      if (!myPlayerId || !selectedTargetId) return;
      tryStartCast("fireball", selectedTargetId);
    };
    
    // Ice Bolt casting
    window.castIceBolt = () => {
      if (!myPlayerId || !selectedTargetId) return;
      tryStartCast("iceBolt", selectedTargetId);
    };
    
    // Water Splash casting
    window.castWater = () => {
      if (!myPlayerId || !selectedTargetId) return;
      tryStartCast("waterSplash", selectedTargetId);
    };
    
    // Petrify casting
    window.castPetrify = () => {
      if (!myPlayerId || !selectedTargetId) return;
      tryStartCast("petrify", selectedTargetId);
    };
    
    // Clean up on unmount
    return () => {
      window.castFireball = undefined;
      window.castIceBolt = undefined;
      window.castWater = undefined;
      window.castPetrify = undefined;
    };
  }, [myPlayerId, selectedTargetId]);
  
  // No rendering needed as VFX is now handled by VfxManager
  return null;
}

// Type definitions for global window events
declare global {
  interface WindowEventMap {
    'skillTriggered': CustomEvent<{
      id: string;
      skillId: string;
      sourceId: string;
      targetId: string;
      startPosition: { x: number; y: number; z: number };
      targetPosition: { x: number; y: number; z: number };
      createdAtTs: number;
    }>;
    'requestPlayerPosition': CustomEvent<{
      effectId: string;
      callback: (position: { x: number; y: number; z: number }) => void;
    }>;
    // Events now handled by VfxManager
    'instanthit': CustomEvent<any>;
    'spawnSplash': CustomEvent<{ position: any; radius: number }>;
    'spawnStunFlash': CustomEvent<{ position: any }>;
    'petrifyFlash': CustomEvent<{ position: any }>;
    'projspawn2': CustomEvent<any>;
    'projhit2': CustomEvent<any>;
  }
  
  interface Window {
    castFireball?: () => void;
    castIceBolt?: () => void;
    castWater?: () => void;
    castPetrify?: () => void;
  }
}