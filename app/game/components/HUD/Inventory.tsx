import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../systems/gameStore';

interface InventoryProps {
  maxSlots?: number;
}

export default function Inventory({ maxSlots = 20 }: InventoryProps) {
  // Use direct inventory state from gameStore
  const inv = useGameStore(s => s.inventory);
  const [flashingSlot, setFlashingSlot] = useState<number | null>(null);
  
  // Debug logging on inventory changes
  useEffect(() => {
    console.log('[Inventory] Inventory state updated:', inv);
  }, [inv]);
  
  // Get the player to access maxInventorySlots if available
  const player = useGameStore(s => s.myPlayerId ? s.players[s.myPlayerId] : null);
  const actualMaxSlots = player?.maxInventorySlots || maxSlots;

  // Function to handle right-click on inventory slots
  const handleRightClick = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    if (inv[i] && inv[i].quantity > 0) {
      useGameStore.getState().sendUseItem(i);
      setFlashingSlot(i);
      setTimeout(() => {
        setFlashingSlot(null);
      }, 1000); // Flashing duration
    }
  };
  
  return (
    <div className="inventory fixed bottom-2 right-2 grid grid-cols-4 gap-1 bg-black/70 p-2 rounded">
      {Array.from({ length: actualMaxSlots }).map((_, i) => (
        <div 
          key={i} 
          className={`w-12 h-12 bg-gray-800 flex items-center justify-center relative transition-all hover:bg-gray-700 ${flashingSlot === i ? 'animate-flash-green' : ''}`}
          title={inv[i] ? `${inv[i].itemId} (${inv[i].quantity})` : 'Empty slot'}
          onContextMenu={(e) => handleRightClick(e, i)}
        >
          {inv[i] ? (
            <div className="relative w-full h-full">
              <img 
                src={`/items/${inv[i].itemId}.png`} 
                className="w-full h-full object-contain"
                alt={`${inv[i].itemId} item`}
                onError={(e) => {
                  // Fallback for missing images
                  const target = e.target as HTMLImageElement;
                  target.onerror = null; // Prevent infinite error loop
                  target.style.display = 'none';
                  
                  // Add a fallback text display
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = 'w-full h-full flex items-center justify-center text-gray-400 text-xs';
                    fallback.textContent = inv[i].itemId.substring(0, 3).toUpperCase();
                    parent.appendChild(fallback);
                  }
                }}
              />
              {inv[i].quantity > 1 && (
                <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                  {inv[i].quantity}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-600 text-xs">•</div>
          )}
        </div>
      ))}
    </div>
  );
}
