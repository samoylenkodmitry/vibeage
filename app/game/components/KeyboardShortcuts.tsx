'use client';

import { useEffect } from 'react';
import { useGameStore } from '../systems/gameStore';
import { validateSkillId } from '../systems/skillUtils';
import { tryStartCast } from '../systems/castController';

/**
 * Component that handles keyboard shortcuts for the game
 * This component doesn't render anything but sets up event listeners
 */
export default function KeyboardShortcuts() {
  // We no longer need the game store's handleSkillHotkey
  const getMyPlayer = useGameStore(state => state.getMyPlayer);
  
  useEffect(() => {
    // Add keyboard event listener for skill shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if input or textarea is focused
      if (document.activeElement instanceof HTMLInputElement || 
          document.activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Only handle number keys 1-9
      if (e.key >= '1' && e.key <= '9') {
        console.log(`Key pressed: ${e.key}`);
        
        const player = getMyPlayer();
        if (!player || !player.skillShortcuts) return;
        
        // Convert key to index (keys 1-9 map to array indices 0-8)
        const keyNum = parseInt(e.key);
        if (isNaN(keyNum) || keyNum < 1 || keyNum > 9) return;
        
        const shortcutIndex = keyNum - 1;
        const skillId = player.skillShortcuts[shortcutIndex];
        
        if (skillId && validateSkillId(skillId)) {
          console.log(`Using skill hotkey ${keyNum} to cast ${skillId}`);
          // Use the new unified cast controller instead of the game store method
          tryStartCast(skillId);
        }
      }
    };
    
    // Add the event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getMyPlayer]);
  
  // This component doesn't render anything
  return null;
}
