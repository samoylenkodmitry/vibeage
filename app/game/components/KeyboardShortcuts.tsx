'use client';

import { useEffect } from 'react';
import { useGameStore } from '../systems/gameStore';
import { tryStartCast } from '../systems/castController';

/**
 * Component that handles keyboard shortcuts for the game
 * This component doesn't render anything but sets up event listeners
 */
export default function KeyboardShortcuts() {
  const getMyPlayer = useGameStore(state => state.getMyPlayer);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const inventory = useGameStore(state => state.inventory);
  
  useEffect(() => {
    // Add keyboard event listener for skill shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if input or textarea is focused
      if (document.activeElement instanceof HTMLInputElement || 
          document.activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Toggle combat log with L key
      if (e.key === 'l' || e.key === 'L') {
        document.body.classList.toggle('hide-combat-log');
        console.log('Combat log toggled with L key');
        return;
      }
      
      // Use health potion with H key
      if (e.key === 'h' || e.key === 'H') {
        // Find a health potion in inventory
        const healthPotionIndex = inventory.findIndex(item => 
          item && item.itemId === 'health_potion' && item.quantity > 0
        );
        
        if (healthPotionIndex !== -1) {
          console.log('Using health potion with H key from slot', healthPotionIndex);
          useGameStore.getState().sendUseItem(healthPotionIndex);
        } else {
          console.log('No health potions found in inventory');
        }
        return;
      }
      
      // Handle skill keybinds with more direct keyboard mapping
      switch (e.code) {
        case 'Digit1':
        case 'KeyQ':
          console.log('Hotkey 1/Q pressed');
          tryStartCast('fireball', selectedTargetId || undefined);
          break;
        case 'Digit2':
        case 'KeyE':
          console.log('Hotkey 2/E pressed');
          tryStartCast('iceBolt', selectedTargetId || undefined);
          break;
        case 'Digit3':
        case 'KeyR':
          console.log('Hotkey 3/R pressed');
          tryStartCast('waterSplash', selectedTargetId || undefined);
          break;
        case 'Digit4':
        case 'KeyF':
          console.log('Hotkey 4/F pressed');
          tryStartCast('petrify', selectedTargetId || undefined);
          break;
      }
    };
    
    // Add the event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getMyPlayer, inventory, selectedTargetId]);
  
  // This component doesn't render anything
  return null;
}
