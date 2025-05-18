'use client';

import { useState, useEffect } from 'react';
import { useGameStore, selectEnemyCount } from '../systems/gameStore';

export default function DebugPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const enemyCount = useGameStore(selectEnemyCount);
  const enemies = useGameStore(state => state.enemies);
  const isConnected = useGameStore(state => state.isConnected);
  const myPlayerId = useGameStore(state => state.myPlayerId);
  const renderPosition = useGameStore(s => s.controlledPlayerRenderPosition);
  
  // Toggle visibility with ~ key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        setIsVisible(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Always render a wrapper component with conditional rendering inside
  // This way, hooks are always called in the same order
  return (
    <div style={{display: isVisible ? 'block' : 'none'}}>
      {isVisible && (
        <div className="fixed top-0 right-0 bg-black/80 text-white p-4 m-4 rounded-lg z-50 max-w-md max-h-[80vh] overflow-auto">
          <h2 className="text-xl font-bold mb-2">Debug Info</h2>
          <div className="space-y-2 text-sm">
            <p>Connection: <span className={isConnected ? "text-green-500" : "text-red-500"}>{isConnected ? "Connected" : "Disconnected"}</span></p>
            <p>Player ID: {myPlayerId || "Not assigned"}</p>
            <p>Enemy Count: {enemyCount}</p>
            <p>Render Pos: {JSON.stringify(renderPosition)}</p>
            
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-1">Enemies:</h3>
              {enemyCount > 0 ? (
                <ul className="space-y-1">
                  {Object.entries(enemies).map(([id, enemy]) => (
                    <li key={id} className="text-xs">
                      {enemy.name} (Lv.{enemy.level}) - Health: {enemy.health}/{enemy.maxHealth} - 
                      Pos: [{Math.round(enemy.position.x)}, {Math.round(enemy.position.y)}, {Math.round(enemy.position.z)}]
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-yellow-500">No enemies found in game state</p>
              )}
            </div>
            
            <div className="mt-4">
              <button 
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                onClick={() => {
                  const socket = useGameStore.getState().socket;
                  if (socket) {
                    console.log('Requesting fresh game state');
                    socket.emit('requestGameState');
                  }
                }}
              >
                Request Game State
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
