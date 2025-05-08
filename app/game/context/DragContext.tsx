import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { SkillId } from '../../../shared/skillsDefinition';

type Ctx = [SkillId|null, (s:SkillId|null)=>void];
const DragCtx = createContext<Ctx|undefined>(undefined);

export function DragProvider({ children }:{children:ReactNode}) {
  const state = useState<SkillId|null>(null);
  return <DragCtx.Provider value={state}>{children}</DragCtx.Provider>;
}

export function useDraggedSkill() {
  const ctx = useContext(DragCtx);
  if (!ctx) throw new Error('useDraggedSkill outside DragProvider');
  return ctx[0];
}
export function useSetDragged() {
  const ctx = useContext(DragCtx);
  if (!ctx) throw new Error('useSetDragged outside DragProvider');
  return ctx[1];
}
