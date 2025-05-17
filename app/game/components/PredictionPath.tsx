import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';

/**
 * Component to visualize predicted paths for entities in 3D space
 */
export default function PredictionPath() {
  const [showDebugPaths, setShowDebugPaths] = useState(false);
  
  // Toggle debug paths on 'F7' key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F7') {
        setShowDebugPaths(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  if (!showDebugPaths) return null;
  
  return (
    <>
      <EntityPredictionPath entityType="players" />
      <EntityPredictionPath entityType="enemies" />
    </>
  );
}

function EntityPredictionPath({ entityType }) {
  const entities = useGameStore(state => state[entityType]);
  const lineMeshes = useRef({});
  
  useFrame(() => {
    // Cleanup old refs for entities that no longer exist
    Object.keys(lineMeshes.current).forEach(id => {
      if (!entities[id]) {
        lineMeshes.current[id].parent?.remove(lineMeshes.current[id]);
        delete lineMeshes.current[id];
      }
    });
    
    // Create or update lines for current entities
    Object.entries(entities).forEach(([id, entity]) => {
      // Skip entities that are dead
      if (!entity.isAlive) return;
      
      // Get prediction data from debug buffer
      const buffer = (window as any).__DEBUG_SNAP_BUFFERS?.[id];
      if (!buffer?.lastSnap?.predictions) return;
      
      const snap = buffer.lastSnap;
      const currentPos = entity.position;
      
      // Create a line from current position through all prediction points
      const points = [
        new THREE.Vector3(currentPos.x, 0.1, currentPos.z),
        new THREE.Vector3(snap.pos.x, 0.1, snap.pos.z),
        ...snap.predictions.map(p => new THREE.Vector3(p.pos.x, 0.1, p.pos.z))
      ];
      
      // Create or update line mesh
      if (!lineMeshes.current[id]) {
        // Create new line
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
          color: entityType === 'players' ? 0x00ff00 : 0xff0000,
          linewidth: 2,
          transparent: true,
          opacity: 0.7
        });
        const line = new THREE.Line(geometry, material);
        lineMeshes.current[id] = line;
        
        // Add to scene
        const scene = (window as any).__R3F?.scene;
        if (scene) scene.add(line);
      } else {
        // Update existing line
        const line = lineMeshes.current[id];
        const geometry = line.geometry;
        geometry.setFromPoints(points);
        geometry.attributes.position.needsUpdate = true;
      }
    });
  });
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(lineMeshes.current).forEach(line => {
        line.parent?.remove(line);
      });
    };
  }, []);
  
  return null;
}
