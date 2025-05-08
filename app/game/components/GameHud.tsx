import React from 'react';
import { DragProvider } from '../context/DragContext';

export default function GameHud({ children }: { children: React.ReactNode }){ 
  return (
    <DragProvider>
      {children}
    </DragProvider>
  ); 
}
