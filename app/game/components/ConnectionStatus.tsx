'use client';

import React, { useEffect, useState } from 'react';
import { useGameStore } from '../systems/gameStore';

const ConnectionStatus: React.FC = () => {
  const isConnected = useGameStore(state => state.isConnected);
  const lastConnectionChangeTs = useGameStore(state => state.lastConnectionChangeTs);
  const [showNotification, setShowNotification] = useState(false);
  
  // Show notification for 3 seconds when connection status changes
  useEffect(() => {
    setShowNotification(true);
    const timer = setTimeout(() => {
      setShowNotification(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [lastConnectionChangeTs]);
  
  // Format time since connection change
  const getTimeSinceMs = () => {
    const elapsedMs = Date.now() - lastConnectionChangeTs;
    if (elapsedMs < 60000) return `${Math.floor(elapsedMs / 1000)}s ago`;
    if (elapsedMs < 3600000) return `${Math.floor(elapsedMs / 60000)}m ago`;
    return `${Math.floor(elapsedMs / 3600000)}h ago`;
  };
  
  return (
    <div className="connection-status">
      {/* Always visible status indicator */}
      <div 
        className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}
        title={`Server ${isConnected ? 'Connected' : 'Disconnected'} (${getTimeSinceMs()})`}
      >
        <div className="status-dot"></div>
        <span className="status-text">{isConnected ? 'Online' : 'Offline'}</span>
      </div>
      
      {/* Notification that fades away */}
      {showNotification && (
        <div className={`status-notification ${isConnected ? 'connected' : 'disconnected'}`}>
          Server {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      )}
      
      <style jsx>{`
        .connection-status {
          position: fixed;
          bottom: 10px;
          right: 10px;
          z-index: 100;
        }
        
        .connection-indicator {
          display: flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 5px;
        }
        
        .connected .status-dot {
          background-color: #4CAF50;
          box-shadow: 0 0 5px #4CAF50;
        }
        
        .disconnected .status-dot {
          background-color: #F44336;
          box-shadow: 0 0 5px #F44336;
        }
        
        .status-notification {
          position: absolute;
          bottom: 100%;
          right: 0;
          margin-bottom: 10px;
          padding: 8px 15px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          animation: fadeOut 3s forwards;
          white-space: nowrap;
        }
        
        .status-notification.connected {
          background-color: rgba(76, 175, 80, 0.9);
          color: white;
        }
        
        .status-notification.disconnected {
          background-color: rgba(244, 67, 54, 0.9);
          color: white;
        }
        
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default ConnectionStatus;
