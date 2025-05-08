'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../systems/gameStore';
import { SKILLS, SkillId } from '../models/Skill';
import { CLASS_SKILL_TREES, canLearnSkill, CharacterClass } from '../../../shared/classSystem';
import { useDragStore } from '../systems/dragState';
import skillUtils from '../systems/skillUtils';
import styles from '../styles/SkillTreeUI.module.css';
import Image from 'next/image';

const SkillTreeUI: React.FC = () => {
  const socket = useGameStore(state => state.socket);
  const player = useGameStore(state => state.getMyPlayer());
  const [availableSkills, setAvailableSkills] = useState<SkillId[]>([]);
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null);
  const [isSkillTreeOpen, setIsSkillTreeOpen] = useState(false);
  // New state for skill shortcuts (keys 1-9)
  const [skillShortcuts, setSkillShortcuts] = useState<(SkillId | null)[]>([null, null, null, null, null, null, null, null, null]);
  // Use the Zustand store for drag state
  const { dragged, setDragged } = useDragStore();
  
  useEffect(() => {
    // Debug log to see if component is rendering and has proper data
    console.log('SkillTreeUI rendering:', { 
      player, 
      className: player?.className,
      skillPoints: player?.availableSkillPoints,
      draggedSkill: dragged
    });
    
    // Update selected class when player data changes
    if (player?.className) {
      setSelectedClass(player.className as CharacterClass);
    }
  }, [player, dragged]);

  useEffect(() => {
    // Calculate available skills when relevant data changes
    if (selectedClass && player) {
      // Get unlearned skills that are available to learn
      const availableSkillsList: SkillId[] = [];
      const classTree = CLASS_SKILL_TREES[selectedClass];
      
      console.log('DEBUG: Calculating available skills', {
        className: selectedClass,
        level: player.level,
        unlockedSkills: player.unlockedSkills,
        skillPoints: player.availableSkillPoints
      });
      
      if (classTree) {
        for (const [skillId, requirement] of Object.entries(classTree.skillProgression)) {
          // Skip skills player already has
          if (player.unlockedSkills.includes(skillId as SkillId)) {
            console.log(`DEBUG: Skipping already unlocked skill: ${skillId}`);
            continue;
          }
          
          // Check if player can learn this skill
          const canLearn = canLearnSkill(
            skillId as SkillId,
            selectedClass,
            player.level,
            player.unlockedSkills as SkillId[]
          );
          
          console.log(`DEBUG: Skill ${skillId} can be learned: ${canLearn}`, {
            levelRequirement: requirement.level,
            playerLevel: player.level,
            requiredSkills: requirement.requiredSkills
          });
          
          if (canLearn) {
            availableSkillsList.push(skillId as SkillId);
          }
        }
      }
      
      console.log('Available skills to learn:', availableSkillsList);
      setAvailableSkills(availableSkillsList);
    }
  }, [player, selectedClass]);

  useEffect(() => {
    // Update skill shortcuts when player data changes
    if (player?.skillShortcuts) {
      setSkillShortcuts(player.skillShortcuts);
    }
  }, [player?.skillShortcuts]);
  
  // Add debugging for drag and drop events
  useEffect(() => {
    // Debug drag and drop issues
    if (typeof window !== 'undefined') {
      console.log('Setting up drag and drop debugging');
      
      const logDragEvent = (e: DragEvent, name: string) => {
        console.log(`Drag event ${name}:`, {
          types: e.dataTransfer ? Array.from(e.dataTransfer.types) : [],
          target: e.target
        });
      };
      
      window.addEventListener('dragstart', (e) => logDragEvent(e, 'dragstart'), false);
      window.addEventListener('drop', (e) => logDragEvent(e, 'drop'), false);
      
      return () => {
        window.removeEventListener('dragstart', (e) => logDragEvent(e, 'dragstart'), false);
        window.removeEventListener('drop', (e) => logDragEvent(e, 'drop'), false);
      };
    }
  }, []);

  const learnSkill = (skillId: SkillId) => {
    console.log('Attempting to learn skill:', skillId, {
      hasSocket: !!socket,
      skillPoints: player?.availableSkillPoints
    });
    
    if (socket && player?.availableSkillPoints && player.availableSkillPoints > 0) {
      console.log('Sending LearnSkill message to server');
      // Send learn skill request to server
      socket.emit('msg', {
        type: 'LearnSkill',
        skillId: skillId
      });
    } else {
      console.log('Cannot learn skill - no socket or skill points:', {
        socket: !!socket,
        skillPoints: player?.availableSkillPoints
      });
    }
  };

  const setSkillShortcut = (skillId: SkillId, slotIndex: number) => {
    if (!socket) {
      console.error('Cannot set skill shortcut: No socket connection');
      return;
    }
    
    if (!player) {
      console.error('Cannot set skill shortcut: No player data');
      return;
    }

    // Validate skill ID - make sure it's an actual skill ID, not a path or something else
    if (!SKILLS[skillId]) {
      console.error(`Cannot set skill shortcut: Invalid skill ID "${skillId}"`);
      return;
    }

    console.log(`Setting skill ${skillId} to shortcut slot ${slotIndex+1}`);
    
    try {
      // First, check if this skill already exists in another slot
      const existingIndex = skillShortcuts.findIndex(s => s === skillId);
      
      // If the skill exists somewhere else and we're not replacing it with itself,
      // clear the old slot first to prevent duplicates
      if (existingIndex !== -1 && existingIndex !== slotIndex) {
        console.log(`Skill ${skillId} already exists in slot ${existingIndex + 1}, removing it first`);
        const newShortcuts = [...skillShortcuts];
        newShortcuts[existingIndex] = null;
        setSkillShortcuts(newShortcuts);
      }
      
      // Send request to set skill shortcut
      socket.emit('msg', {
        type: 'SetSkillShortcut',
        slotIndex: slotIndex,
        skillId: skillId
      });
      
      // Immediately update local state for responsive UI
      const newShortcuts = [...skillShortcuts];
      newShortcuts[slotIndex] = skillId;
      setSkillShortcuts(newShortcuts);
      
      // Add visual feedback
      const slotElement = document.querySelector(`.${styles.shortcutSlot}:nth-child(${slotIndex + 1})`);
      if (slotElement) {
        slotElement.classList.add(styles.shortcutSuccess);
        setTimeout(() => {
          slotElement.classList.remove(styles.shortcutSuccess);
        }, 500);
      }
      
    } catch (err) {
      console.error('Error setting skill shortcut:', err);
    }
  };

  const toggleSkillTree = (e: React.MouseEvent) => {
    // Prevent event from propagating to the world
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Toggle skill tree clicked');
    setIsSkillTreeOpen(!isSkillTreeOpen);
  };

  console.log('SkillTreeUI render checks:', { 
    hasPlayer: !!player, 
    playerClassName: player?.className,
    selectedClass,
    classTreeExists: selectedClass ? !!CLASS_SKILL_TREES[selectedClass] : false 
  });

  // If we don't have player data yet, render just the button for now
  if (!player) {
    console.log('No player data yet, rendering only button');
    return (
      <button 
        className={styles.skillTreeButton} 
        onClick={toggleSkillTree}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        Skill Tree
      </button>
    );
  }

  // If we don't have a class selected or the class tree doesn't exist, just show button
  if (!selectedClass || !CLASS_SKILL_TREES[selectedClass]) {
    console.log('No class selected or class tree missing');
    return (
      <button 
        className={styles.skillTreeButton} 
        onClick={toggleSkillTree}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        Skill Tree ({player.className})
      </button>
    );
  }

  const classTree = selectedClass ? CLASS_SKILL_TREES[selectedClass] : null;
  const canDrag = typeof window !== 'undefined' && window.matchMedia('(pointer:fine)').matches;

  return (
    <>
      <button 
        className={styles.skillTreeButton} 
        onClick={toggleSkillTree}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        Skill Tree
      </button>

      {isSkillTreeOpen && classTree && (
        <div 
          className={styles.skillTreeOverlay}
          onClick={(e) => {
            e.stopPropagation();
            // Clear drag state when clicking the overlay
            if (dragged) setDragged(null);
          }}
        >
          <div className={styles.skillTreeContainer}>
            <div className={styles.skillTreeHeader}>
              <h2>{classTree.className} Skill Tree</h2>
              <p>{classTree.description}</p>
              <p>Available Skill Points: {player.availableSkillPoints}</p>
              <button 
                className={styles.closeButton}
                onClick={toggleSkillTree}
              >
                Close
              </button>
            </div>

            <div className={styles.skillsContainer}>
              <div className={styles.unlockedSkills}>
                <h3>Unlocked Skills</h3>
                {player.unlockedSkills.length === 0 ? (
                  <p>No skills unlocked yet</p>
                ) : (
                  <div className={styles.skillsList}>
                    {player.unlockedSkills.map((skillId) => {
                      const skill = SKILLS[skillId];
                      return (
                        <div key={skillId} 
                          className={`${styles.skillItem} ${dragged === skillId ? styles.tapSelect : ''}`}
                        >
                          <Image 
                            src={skillUtils.getSkillIconPath(skillId)} 
                            width={50}
                            height={50}
                            alt={skill.name} 
                            title={skill.description}
                            onClick={() => {
                              if (!dragged) {
                                setDragged(skillId);
                              } else {
                                setDragged(null);
                              }
                            }}
                            onDoubleClick={() => {
                              // When double-clicking a skill, assign it to the first available slot
                              console.log('Skill double-clicked:', skillId);
                              const availableSlotIndex = skillShortcuts.findIndex(skill => skill === null);
                              if (availableSlotIndex !== -1) {
                                console.log(`Assigning to first available slot: ${availableSlotIndex + 1}`);
                                setSkillShortcut(skillId, availableSlotIndex);
                              } else {
                                // If no empty slots, assign to slot 1
                                console.log('No empty slots, assigning to slot 1');
                                setSkillShortcut(skillId, 0);
                              }
                            }}
                            draggable={canDrag}
                            onDragStart={canDrag ? (e) => {
                              // Make sure we have a valid skill ID to start the drag
                              if (!SKILLS[skillId]) {
                                console.error(`Attempting to drag invalid skill: ${skillId}`);
                                return;
                              }

                              console.log('Drag started with skill ID:', skillId);

                              // Store the skill ID in our global drag state
                              setDragged(skillId);

                              // Set the drag effect to copy
                              e.dataTransfer.effectAllowed = 'copy';
                            } : undefined}
                            onDragEnd={() => {
                              console.log('Drag ended, clearing drag state');
                              setDragged(null);
                            }}
                          />
                          <span>{skill.name}</span>
                          <div className={styles.skillDetails}>
                            <p>Level Required: {skill.levelRequired}</p>
                            <p>Mana Cost: {skill.manaCost}</p>
                            <p>Cooldown: {skill.cooldownMs}ms</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={styles.availableSkills}>
                <h3>Available to Learn</h3>
                {availableSkills.length === 0 ? (
                  <p>No skills available to learn</p>
                ) : (
                  <div className={styles.skillsList}>
                    {availableSkills.map((skillId) => {
                      const skill = SKILLS[skillId];
                      return (
                        <div key={skillId} className={styles.skillItem}>
                          <Image 
                            src={skillUtils.getSkillIconPath(skillId)} 
                            alt={skill.name} 
                            title={skill.description}
                            width={50}
                            height={50}
                          />
                          <span>{skill.name}</span>
                          <div className={styles.skillDetails}>
                            <p>Level Required: {skill.levelRequired}</p>
                            <p>Mana Cost: {skill.manaCost}</p>
                            <p>Cooldown: {skill.cooldownMs}ms</p>
                          </div>
                          <button 
                            className={styles.learnButton}
                            disabled={player.availableSkillPoints <= 0}
                            onClick={() => learnSkill(skillId)}
                          >
                            Learn
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.activeSkillsSection}>
              <h3>Skill Shortcuts (1-9)</h3>
              <p>Click a skill then a number to assign it as a shortcut, or click directly to cast</p>
              
              {/* Shortcut slots */}
              <div className={styles.shortcutsPanel}>
                {skillShortcuts.map((skillId, index) => (
                  <div 
                    key={index} 
                    className={styles.shortcutSlot}
                    data-slot-index={index}
                    onClick={() => {
                      // If we have a selected skill and the user clicks a slot,
                      // set the skill to that slot (alternative to drag and drop)
                      if (dragged && SKILLS[dragged] &&
                          player?.unlockedSkills.includes(dragged)) {
                        console.log(`Slot ${index+1} clicked with skill ${dragged} selected`);
                        setSkillShortcut(dragged, index);
                        setDragged(null);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault(); // Necessary to allow drop
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'copy';
                      e.currentTarget.classList.add(styles.dragOver);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add(styles.dragOver);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove(styles.dragOver);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove(styles.dragOver);
                      
                      console.log('Drop event triggered on slot', index + 1);

                      const skillIdRaw = dragged;
                      console.log('Raw skill ID from drag state:', skillIdRaw);
                      setDragged(null);

                      // Validate and normalize the skill ID
                      const skillId = skillUtils.validateSkillId(skillIdRaw);
                      console.log('Validated skill ID:', skillId);
                      
                      if (skillId) {
                        console.log(`Valid skill found: ${skillId}, adding to slot ${index + 1}`);
                        // Add visual feedback for the drop
                        e.currentTarget.classList.add(styles.dropSuccess);
                        setTimeout(() => {
                          try {
                              e.currentTarget.classList.remove(styles.dropSuccess);
                          } catch {
                              // Ignoring errors when removing class if element no longer exists
                              console.debug('Failed to remove drop success class');
                          }
                        }, 500);
                        
                        // Set the shortcut with the validated skill ID
                        setSkillShortcut(skillId, index);
                        
                      } else {
                        console.error('Failed to get valid skill ID from drop event. Value:', skillIdRaw);
                        
                      }
                    }}
                  >
                    <div className={styles.keyNumber}>{index + 1}</div>
                    {skillId ? (
                      <Image 
                        src={skillUtils.getSkillIconPath(skillId)} 
                        alt={SKILLS[skillId] ? SKILLS[skillId].name : skillId} 
                        title={SKILLS[skillId] ? SKILLS[skillId].description : skillId}
                        width={50}
                        height={50}
                      />
                    ) : (
                      <div className={styles.emptySlot} />
                    )}
                  </div>
                ))}
              </div>
              
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SkillTreeUI;
