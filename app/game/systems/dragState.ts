'use client';

/**
 * Drag state manager implemented with Zustand
 * This helps work around cross-browser drag and drop limitations
 * and adds support for touch devices
 */

import { create } from 'zustand';
import { SkillId } from '../models/Skill';

type DragStore = { 
  dragged: SkillId|null, 
  setDragged: (s: SkillId|null) => void 
};

export const useDragStore = create<DragStore>((set) => ({
  dragged: null,
  setDragged: (skillId: SkillId|null) => set({ dragged: skillId })
}));
