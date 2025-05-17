import { useGameStore } from '../../systems/gameStore';

interface InventoryProps {
  maxSlots?: number;
}

export default function Inventory({ maxSlots = 20 }: InventoryProps) {
  const inv = useGameStore(s => s.inventory);
  
  return (
    <div className="inventory fixed bottom-2 right-2 grid grid-cols-4 gap-1 bg-black/70 p-2 rounded">
      {Array.from({ length: maxSlots }).map((_, i) => (
        <div key={i} className="w-12 h-12 bg-gray-800">
          {inv[i] && (
            <img src={`/items/${inv[i].itemId}.png`} className="w-full h-full" />
          )}
        </div>
      ))}
    </div>
  );
}
