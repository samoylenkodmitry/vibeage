import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../systems/gameStore';
import Image from 'next/image';

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
  
  // Function to handle left-click on inventory slots
  const handleClick = (e: React.MouseEvent, i: number) => {
    e.stopPropagation(); // Prevent click from passing through
    if (inv[i] && inv[i].quantity > 0) {
      console.log(`Clicked on item: ${inv[i].itemId}, quantity: ${inv[i].quantity}`);
      // Add additional click behavior here as needed
    }
  };
  
  return (
    <div className="inventory fixed bottom-2 right-2 grid grid-cols-4 gap-1 bg-black/70 p-2 rounded z-20">
      {Array.from({ length: actualMaxSlots }).map((_, i) => (
        <div 
          key={i} 
          className={`w-12 h-12 bg-gray-800 flex items-center justify-center relative transition-all hover:bg-gray-700 cursor-pointer ${flashingSlot === i ? 'animate-flash-green' : ''}`}
          title={inv[i] ? `${inv[i].itemId} (${inv[i].quantity})` : 'Empty slot'}
          onContextMenu={(e) => handleRightClick(e, i)}
          onClick={(e) => handleClick(e, i)}
        >
          {inv[i] ? (
            <div className="relative w-full h-full">
              {/* Use Next.js Image component instead of img */}
              <div className="relative w-full h-full">
                <Image
                  src={`/items/${inv[i].itemId}.png`}
                  fill
                  style={{ objectFit: 'contain' }}
                  alt={`${inv[i].itemId} item`}
                  onError={() => {
                    console.log(`Image for ${inv[i].itemId} not found`);
                    // Fallback will be handled by next/image automatically
                  }}
                  unoptimized // For game assets, skip optimization
                />
              </div>
              {inv[i].quantity > 1 && (
                <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl z-10">
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
