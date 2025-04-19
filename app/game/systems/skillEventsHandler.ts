// filepath: /home/s/develop/projects/vibe/1/app/game/systems/skillEventsHandler.ts
'use client';

import { Vector3 } from 'three';
import { useGameStore } from './gameStore';

// Define a type for the event listeners
type SkillEffectListener = (effect: {
  id: string;
  skillId: string;
  sourceId: string;
  targetId: string;
  startPosition: Vector3;
  targetPosition: Vector3;
  createdAtTs: number;
}) => void;

// A simple event bus for skill effects
class SkillEventsBus {
  private listeners: SkillEffectListener[] = [];

  // Register a listener
  addListener(listener: SkillEffectListener) {
    this.listeners.push(listener);
    return () => this.removeListener(listener);
  }

  // Remove a listener
  removeListener(listener: SkillEffectListener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Trigger an event
  triggerSkillEffect(effect: {
    id: string;
    skillId: string;
    sourceId: string;
    targetId: string;
    startPosition: Vector3;
    targetPosition: Vector3;
    createdAtTs: number;
  }) {
    this.listeners.forEach(listener => listener(effect));
  }
}

// Create a singleton instance
export const skillEventsBus = new SkillEventsBus();

// Initialize socket event handling
export function initializeSkillEventHandling() {
  const socket = useGameStore.getState().socket;
  
  if (socket) {
    console.log('Setting up skill effect socket listener');
    
    // Handle skillEffect events from server
    socket.on('skillEffect', (data: { skillId: string, sourceId: string, targetId: string }) => {
      console.log('Skill effect received:', data);
      
      // Get current game state
      const state = useGameStore.getState();
      const sourcePlayer = state.players[data.sourceId];
      const targetEnemy = state.enemies[data.targetId];
      
      if (sourcePlayer && targetEnemy) {
        // Create the effect data
        const effectData = {
          id: `effect-${Math.random().toString(36).substr(2, 9)}`,
          skillId: data.skillId,
          sourceId: data.sourceId,
          targetId: data.targetId,
          startPosition: new Vector3(
            sourcePlayer.position.x,
            sourcePlayer.position.y + 1.5, // Cast from shoulder height
            sourcePlayer.position.z
          ),
          targetPosition: new Vector3(
            targetEnemy.position.x,
            targetEnemy.position.y + 1.0, // Target center mass
            targetEnemy.position.z
          ),
          createdAtTs: Date.now()
        };
        
        // Publish the effect
        skillEventsBus.triggerSkillEffect(effectData);
      }
    });
    
    return () => {
      socket.off('skillEffect');
    };
  }
  
  return () => {};
}
