import React, { useState, useEffect } from 'react';
import { useGameStore } from '../systems/gameStore';

/**
 * Debug component to visualize prediction keyframes and interpolation
 */
export default function PredictionDebug() {
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  
  // Toggle debug info on 'F6' key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F6') {
        setShowDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Collect debug info from game state
  useEffect(() => {
    if (!showDebug) return;
    
    const collectDebugInfo = () => {
      const state = useGameStore.getState();
      const { players, enemies } = state;
      
      const info = [];
      
      // Sample 1-2 entities for debugging
      const entities = { ...players, ...enemies };
      const entityIds = Object.keys(entities).slice(0, 2);
      
      entityIds.forEach(id => {
        const entity = entities[id];
        const buffer = window.__DEBUG_SNAP_BUFFERS?.[id];
        if (!buffer?.lastSnap) return;
        
        const snap = buffer.lastSnap;
        const predictions = snap.predictions || [];
        
        info.push({
          id,
          type: id.startsWith('player') ? 'player' : 'enemy',
          currentPosition: entity.position,
          snapPosition: snap.pos,
          snapTimestamp: snap.serverSnapTs,
          predictions: predictions.map(p => ({
            position: p.pos,
            rotation: p.rotY,
            timestamp: p.ts
          }))
        });
      });
      
      setDebugInfo(info);
    };
    
    const interval = setInterval(collectDebugInfo, 500);
    return () => clearInterval(interval);
  }, [showDebug]);
  
  if (!showDebug) return null;
  
  return (
    <div className="prediction-debug" style={{
      position: 'absolute',
      top: 10,
      right: 10,
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: 10,
      borderRadius: 5,
      maxWidth: 400,
      fontSize: 12,
      zIndex: 1000
    }}>
      <h3>Prediction Debug (F6 to toggle)</h3>
      {debugInfo.length === 0 ? (
        <p>No prediction data available</p>
      ) : (
        debugInfo.map(info => (
          <div key={info.id} style={{ marginBottom: 10 }}>
            <h4>{info.type}: {info.id}</h4>
            <p>Current: {formatPos(info.currentPosition)}</p>
            <p>Snap: {formatPos(info.snapPosition)} @ {new Date(info.snapTimestamp).toISOString().substr(11, 12)}</p>
            <h5>Predictions ({info.predictions.length}):</h5>
            <ul style={{ maxHeight: 150, overflow: 'auto' }}>
              {info.predictions.map((pred, i) => (
                <li key={i}>
                  Pos: {formatPos(pred.position)} @ +{pred.timestamp - info.snapTimestamp}ms
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

// Helper function to format positions
function formatPos(pos) {
  if (!pos) return 'N/A';
  return `(${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`;
}
