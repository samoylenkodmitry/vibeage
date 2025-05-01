'use client';

/**
 * Simple drag state manager to reliably track currently dragged skill
 * This helps work around cross-browser drag and drop limitations
 */

let currentlyDraggedSkillId: string | null = null;

function setDraggedSkill(skillId: string | null) {
  console.log('Setting dragged skill to:', skillId);
  currentlyDraggedSkillId = skillId;
}

function getDraggedSkill() {
  console.log('Getting dragged skill:', currentlyDraggedSkillId);
  return currentlyDraggedSkillId;
}

function clearDraggedSkill() {
  console.log('Clearing dragged skill');
  currentlyDraggedSkillId = null;
}

const dragState = {
  setDraggedSkill,
  getDraggedSkill,
  clearDraggedSkill
};

export default dragState;
