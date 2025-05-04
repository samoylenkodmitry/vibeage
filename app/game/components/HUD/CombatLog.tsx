import { useCombatLogStore } from '../../stores/useCombatLogStore';
import { useEffect, useState } from 'react';

export default function CombatLog() {
  const list = useCombatLogStore(s => s.list);

  // to fade after 6s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div 
      data-testid="combat-log"
      className="absolute left-2 bottom-2 w-72 text-xs font-mono pointer-events-none"
    >
      {list.slice(-20).map(e => {
        const age = now - e.ts;
        const op = age > 6000 ? 0 : 1 - age/6000;
        
        // Don't render entries that are completely faded out
        if (op <= 0) return null;
        
        return (
          <div 
            key={e.id}
            data-testid="log-entry"
            style={{opacity: op}}
            className="leading-4 text-white drop-shadow-sm"
          >
            {e.text}
          </div>
        );
      })}
    </div>
  );
}
