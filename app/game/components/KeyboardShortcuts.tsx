'use client';

import { useEffect } from 'react';
import { useGameStore } from '../systems/gameStore';
import { validateSkillId } from '../systems/skillUtils';

/**
 * Component that handles keyboard shortcuts for the game
 * This component doesn't render anything but sets up event listeners
 */
export default function KeyboardShortcuts() {
  const handleSkillHotkey = useGameStore(state => state.handleSkillHotkey);
  
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
        handleSkillHotkey(e.key);
      }
    };
    
    // Add the event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSkillHotkey]);
  
  // This component doesn't render anything
  return null;
}
