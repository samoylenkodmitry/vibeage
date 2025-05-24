'use client';

import React, { useState } from 'react';
import { DungeonTemplate, DungeonInstance, DungeonSystem } from '../systems/dungeonSystem';

interface Props {
  dungeonSystem: DungeonSystem;
  playerId: string;
  playerLevel: number;
  isVisible: boolean;
  onClose: () => void;
  onEnterDungeon: (instanceId: string) => void;
}

function DungeonCard({ 
  dungeon, 
  onEnter, 
  playerLevel,
  canEnter 
}: { 
  dungeon: DungeonTemplate; 
  onEnter: (dungeonId: string) => void;
  playerLevel: number;
  canEnter: boolean;
}) {
  const getDifficultyColor = () => {
    const levelDiff = dungeon.requiredLevel - playerLevel;
    if (levelDiff > 5) return '#f87171'; // Too hard
    if (levelDiff > 0) return '#fbbf24'; // Challenging
    if (levelDiff > -5) return '#4ade80'; // Appropriate
    return '#94a3b8'; // Too easy
  };

  const getThemeIcon = () => {
    switch (dungeon.theme) {
      case 'shadow': return '🌑';
      case 'fire': return '🔥';
      case 'ice': return '❄️';
      default: return '🏰';
    }
  };

  const getThemeColor = () => {
    switch (dungeon.theme) {
      case 'shadow': return '#7c3aed';
      case 'fire': return '#dc2626';
      case 'ice': return '#0ea5e9';
      default: return '#64748b';
    }
  };

  return (
    <div className="dungeon-card">
      <div className="dungeon-header">
        <div className="dungeon-icon" style={{ color: getThemeColor() }}>
          {getThemeIcon()}
        </div>
        <div className="dungeon-info">
          <div className="dungeon-name">{dungeon.name}</div>
          <div className="dungeon-meta">
            <span 
              className="required-level"
              style={{ color: getDifficultyColor() }}
            >
              Level {dungeon.requiredLevel}+
            </span>
            <span className="player-limit">
              Max {dungeon.maxPlayers} players
            </span>
          </div>
        </div>
      </div>
      
      <div className="dungeon-description">
        {dungeon.description}
      </div>
      
      <div className="dungeon-stats">
        <div className="stat-item">
          <span className="stat-label">Rooms:</span>
          <span className="stat-value">{dungeon.rooms.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Theme:</span>
          <span className="stat-value" style={{ color: getThemeColor() }}>
            {dungeon.theme.charAt(0).toUpperCase() + dungeon.theme.slice(1)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Time Limit:</span>
          <span className="stat-value">{dungeon.timeLimit / 60}m</span>
        </div>
      </div>
      
      <div className="dungeon-rewards">
        <div className="rewards-title">Potential Rewards:</div>
        <div className="rewards-grid">
          {dungeon.rooms.map((room, index) => (
            <div key={index} className="room-rewards">
              {room.loot.map((loot, lootIndex) => (
                <div key={lootIndex} className="reward-item">
                  {loot.itemId} ({loot.dropChance * 100}%)
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      <button
        className={`enter-button ${canEnter ? 'enabled' : 'disabled'}`}
        onClick={() => canEnter && onEnter(dungeon.id)}
        disabled={!canEnter}
      >
        {canEnter ? 'Enter Dungeon' : 
         playerLevel < dungeon.requiredLevel ? 
         `Requires Level ${dungeon.requiredLevel}` : 
         'Cannot Enter'}
      </button>
    </div>
  );
}

function ActiveInstanceCard({ 
  instance, 
  onJoin, 
  onLeave, 
  playerId 
}: { 
  instance: DungeonInstance; 
  onJoin: (instanceId: string) => void;
  onLeave: (instanceId: string) => void;
  playerId: string;
}) {
  const isPlayerInInstance = instance.players.includes(playerId);
  const timeRemaining = Math.ceil((instance.timeLimit - (Date.now() - instance.createdAt)) / 1000 / 60);
  
  return (
    <div className="instance-card">
      <div className="instance-header">
        <div className="instance-info">
          <div className="instance-name">Instance #{instance.id.slice(0, 8)}</div>
          <div className="instance-meta">
            <span className="player-count">
              {instance.players.length}/{instance.maxPlayers} players
            </span>
            <span className="time-remaining">
              {timeRemaining}m remaining
            </span>
          </div>
        </div>
        <div className="instance-status">
          {instance.state === 'active' ? '🟢 Active' : 
           instance.state === 'completed' ? '✅ Complete' : 
           '🔴 Failed'}
        </div>
      </div>
      
      <div className="instance-progress">
        <div className="progress-label">
          Room {instance.currentRoomIndex + 1} of {instance.template.rooms.length}
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ 
              width: `${((instance.currentRoomIndex + 1) / instance.template.rooms.length) * 100}%` 
            }}
          />
        </div>
      </div>
      
      <div className="instance-players">
        <div className="players-title">Players:</div>
        <div className="players-list">
          {instance.players.map((playerIdInInstance, index) => (
            <span key={index} className="player-name">
              {playerIdInInstance === playerId ? 'You' : `Player ${index + 1}`}
            </span>
          ))}
        </div>
      </div>
      
      <div className="instance-actions">
        {isPlayerInInstance ? (
          <button 
            className="leave-button"
            onClick={() => onLeave(instance.id)}
          >
            Leave Instance
          </button>
        ) : (
          <button 
            className="join-button"
            onClick={() => onJoin(instance.id)}
            disabled={instance.players.length >= instance.maxPlayers}
          >
            {instance.players.length >= instance.maxPlayers ? 'Full' : 'Join Instance'}
          </button>
        )}
      </div>
    </div>
  );
}

export function DungeonUI({ 
  dungeonSystem, 
  playerId, 
  playerLevel, 
  isVisible, 
  onClose, 
  onEnterDungeon 
}: Props) {
  const [activeTab, setActiveTab] = useState<'dungeons' | 'instances'>('dungeons');
  const dungeons = dungeonSystem.getDungeonTemplates();
  const activeInstances = dungeonSystem.getActiveInstances();

  const handleCreateInstance = (dungeonId: string) => {
    const instanceId = dungeonSystem.createInstance(dungeonId, playerId);
    if (instanceId) {
      onEnterDungeon(instanceId);
    }
  };

  const handleJoinInstance = (instanceId: string) => {
    if (dungeonSystem.joinInstance(instanceId, playerId)) {
      onEnterDungeon(instanceId);
    }
  };

  const handleLeaveInstance = (instanceId: string) => {
    dungeonSystem.leaveInstance(instanceId, playerId);
  };

  if (!isVisible) return null;

  return (
    <div className="dungeon-ui-overlay">
      <div className="dungeon-ui-panel">
        <div className="dungeon-ui-header">
          <h2>Dungeons</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="dungeon-tabs">
          <button 
            className={`tab ${activeTab === 'dungeons' ? 'active' : ''}`}
            onClick={() => setActiveTab('dungeons')}
          >
            Available Dungeons ({dungeons.length})
          </button>
          <button 
            className={`tab ${activeTab === 'instances' ? 'active' : ''}`}
            onClick={() => setActiveTab('instances')}
          >
            Active Instances ({activeInstances.length})
          </button>
        </div>
        
        <div className="dungeon-content">
          {activeTab === 'dungeons' && (
            <div className="dungeons-list">
              {dungeons.map(dungeon => (
                <DungeonCard
                  key={dungeon.id}
                  dungeon={dungeon}
                  playerLevel={playerLevel}
                  canEnter={playerLevel >= dungeon.requiredLevel}
                  onEnter={handleCreateInstance}
                />
              ))}
            </div>
          )}
          
          {activeTab === 'instances' && (
            <div className="instances-list">
              {activeInstances.length === 0 ? (
                <div className="no-instances">No active instances</div>
              ) : (
                activeInstances.map(instance => (
                  <ActiveInstanceCard
                    key={instance.id}
                    instance={instance}
                    playerId={playerId}
                    onJoin={handleJoinInstance}
                    onLeave={handleLeaveInstance}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
      
      <style jsx>{`
        .dungeon-ui-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        .dungeon-ui-panel {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          border: 2px solid #475569;
          border-radius: 12px;
          width: 90%;
          max-width: 900px;
          height: 80%;
          max-height: 700px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        }
        
        .dungeon-ui-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 2px solid #475569;
          background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
          border-radius: 10px 10px 0 0;
        }
        
        .dungeon-ui-header h2 {
          color: #f1f5f9;
          margin: 0;
          font-size: 24px;
          font-weight: bold;
        }
        
        .close-button {
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .close-button:hover {
          background: #ef4444;
        }
        
        .dungeon-tabs {
          display: flex;
          background: #0f172a;
          border-bottom: 2px solid #475569;
        }
        
        .tab {
          flex: 1;
          padding: 12px 20px;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .tab:hover {
          background: #1e293b;
          color: #e2e8f0;
        }
        
        .tab.active {
          background: #1e293b;
          color: #f1f5f9;
          border-bottom: 3px solid #8b5cf6;
        }
        
        .dungeon-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        
        .dungeon-card, .instance-card {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 16px;
          transition: all 0.2s;
        }
        
        .dungeon-card:hover, .instance-card:hover {
          border-color: #475569;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .dungeon-header, .instance-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        
        .dungeon-icon {
          font-size: 32px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(51, 65, 85, 0.5);
          border-radius: 8px;
        }
        
        .dungeon-info, .instance-info {
          flex: 1;
        }
        
        .dungeon-name, .instance-name {
          color: #f1f5f9;
          font-weight: 600;
          font-size: 18px;
          margin-bottom: 4px;
        }
        
        .dungeon-meta, .instance-meta {
          display: flex;
          gap: 16px;
          font-size: 12px;
        }
        
        .required-level, .player-count, .time-remaining {
          color: #94a3b8;
        }
        
        .player-limit {
          color: #64748b;
        }
        
        .instance-status {
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(51, 65, 85, 0.5);
          font-size: 12px;
          color: #e2e8f0;
        }
        
        .dungeon-description {
          color: #cbd5e1;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 16px;
        }
        
        .dungeon-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .stat-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(51, 65, 85, 0.3);
          border-radius: 4px;
        }
        
        .stat-label {
          color: #94a3b8;
          font-size: 12px;
        }
        
        .stat-value {
          color: #e2e8f0;
          font-weight: 500;
          font-size: 12px;
        }
        
        .dungeon-rewards {
          margin-bottom: 20px;
        }
        
        .rewards-title {
          color: #fbbf24;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .rewards-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .reward-item {
          background: #1e40af;
          color: #93c5fd;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
        }
        
        .enter-button {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .enter-button.enabled {
          background: #059669;
          color: white;
        }
        
        .enter-button.enabled:hover {
          background: #047857;
        }
        
        .enter-button.disabled {
          background: #374151;
          color: #9ca3af;
          cursor: not-allowed;
        }
        
        .instance-progress {
          margin-bottom: 16px;
        }
        
        .progress-label {
          color: #cbd5e1;
          font-size: 12px;
          margin-bottom: 4px;
        }
        
        .progress-bar {
          width: 100%;
          height: 8px;
          background: #334155;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: #8b5cf6;
          transition: width 0.3s ease;
        }
        
        .instance-players {
          margin-bottom: 16px;
        }
        
        .players-title {
          color: #94a3b8;
          font-size: 12px;
          margin-bottom: 4px;
        }
        
        .players-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .player-name {
          background: #334155;
          color: #cbd5e1;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .join-button, .leave-button {
          width: 100%;
          padding: 10px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .join-button {
          background: #059669;
          color: white;
        }
        
        .join-button:hover:not(:disabled) {
          background: #047857;
        }
        
        .join-button:disabled {
          background: #374151;
          color: #9ca3af;
          cursor: not-allowed;
        }
        
        .leave-button {
          background: #dc2626;
          color: white;
        }
        
        .leave-button:hover {
          background: #b91c1c;
        }
        
        .no-instances {
          text-align: center;
          color: #64748b;
          font-style: italic;
          padding: 40px;
        }
      `}</style>
    </div>
  );
}

export default DungeonUI;
