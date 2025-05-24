'use client';

import React, { useState, useEffect } from 'react';
import { Quest, QuestObjective, QuestManager } from '../systems/questSystem';
import { ITEMS } from '../../../shared/items';

interface Props {
  questSystem: QuestManager;
  playerId: string;
  isVisible: boolean;
  onClose: () => void;
}

function QuestObjectiveComponent({ objective, isCompleted }: { objective: QuestObjective; isCompleted: boolean }) {
  const getObjectiveText = () => {
    switch (objective.type) {
      case 'kill':
        return `Kill ${objective.currentCount}/${objective.requiredCount} ${objective.target}`;
      case 'collect':
        return `Collect ${objective.currentCount}/${objective.requiredCount} ${objective.target}`;
      case 'interact':
        return `Interact with ${objective.target}`;
      case 'reach_location':
        return `Explore ${objective.target}`;
      default:
        return objective.description || 'Complete objective';
    }
  };

  return (
    <div className={`quest-objective ${isCompleted ? 'completed' : ''}`}>
      <div className="objective-checkbox">
        {isCompleted ? '✓' : '○'}
      </div>
      <div className="objective-text">
        {getObjectiveText()}
      </div>
      {objective.type !== 'interact' && objective.type !== 'reach_location' && (
        <div className="objective-progress">
          <div 
            className="progress-bar"
            style={{ width: `${(objective.currentCount / objective.requiredCount) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function QuestCard({ quest, onAbandon }: { quest: Quest; onAbandon: (questId: string) => void }) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'main': return '⭐';
      case 'side': return '📋';
      case 'daily': return '📅';
      case 'chain': return '🔗';
      default: return '❓';
    }
  };

  return (
    <div className="quest-card">
      <div className="quest-header">
        <div className="quest-title">
          <span className="quest-icon">{getTypeIcon(quest.type)}</span>
          <span className="quest-name">{quest.title}</span>
        </div>
        <button 
          className="abandon-button"
          onClick={() => onAbandon(quest.id)}
          title="Abandon Quest"
        >
          ×
        </button>
      </div>
      
      <div className="quest-description">
        {quest.description}
      </div>
      
      <div className="quest-objectives">
        {quest.objectives.map((objective, index) => (
          <QuestObjectiveComponent
            key={index}
            objective={objective}
            isCompleted={objective.currentCount >= objective.requiredCount}
          />
        ))}
      </div>
      
      <div className="quest-rewards">
        <div className="rewards-title">Rewards:</div>
        <div className="rewards-list">
          {quest.rewards.experience && (
            <span className="reward-exp">+{quest.rewards.experience} XP</span>
          )}
          {quest.rewards.gold && (
            <span className="reward-gold">+{quest.rewards.gold} Gold</span>
          )}
          {quest.rewards.items?.map((item, index) => (
            <span key={index} className="reward-item">
              {ITEMS[item.itemId]?.name || item.itemId} x{item.quantity}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QuestUI({ questSystem, playerId, isVisible, onClose }: Props) {
  const [activeQuests, setActiveQuests] = useState<Quest[]>([]);
  const [availableQuests, setAvailableQuests] = useState<Quest[]>([]);
  const [completedQuests, setCompletedQuests] = useState<Quest[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'available' | 'completed'>('active');

  useEffect(() => {
    if (isVisible) {
      // For now, assume player level 1. This should come from player data
      const playerLevel = 1;
      setActiveQuests(questSystem.getPlayerActiveQuests(playerId));
      setAvailableQuests(questSystem.getPlayerAvailableQuests(playerId, playerLevel));
      setCompletedQuests(questSystem.getPlayerCompletedQuestObjects(playerId));
    }
  }, [isVisible, questSystem, playerId]);

  const handleAcceptQuest = (questId: string) => {
    questSystem.acceptQuest(playerId, questId);
    // For now, assume player level 1. This should come from player data
    const playerLevel = 1;
    setActiveQuests(questSystem.getPlayerActiveQuests(playerId));
    setAvailableQuests(questSystem.getPlayerAvailableQuests(playerId, playerLevel));
  };

  const handleAbandonQuest = (questId: string) => {
    questSystem.abandonQuest(playerId, questId);
    // For now, assume player level 1. This should come from player data
    const playerLevel = 1;
    setActiveQuests(questSystem.getPlayerActiveQuests(playerId));
    setAvailableQuests(questSystem.getPlayerAvailableQuests(playerId, playerLevel));
  };

  if (!isVisible) return null;

  return (
    <div className="quest-ui-overlay">
      <div className="quest-ui-panel">
        <div className="quest-ui-header">
          <h2>Quest Log</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="quest-tabs">
          <button 
            className={`tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active ({activeQuests.length})
          </button>
          <button 
            className={`tab ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            Available ({availableQuests.length})
          </button>
          <button 
            className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed ({completedQuests.length})
          </button>
        </div>
        
        <div className="quest-content">
          {activeTab === 'active' && (
            <div className="active-quests">
              {activeQuests.length === 0 ? (
                <div className="no-quests">No active quests</div>
              ) : (
                activeQuests.map(quest => (
                  <QuestCard 
                    key={quest.id} 
                    quest={quest} 
                    onAbandon={handleAbandonQuest}
                  />
                ))
              )}
            </div>
          )}
          
          {activeTab === 'available' && (
            <div className="available-quests">
              {availableQuests.length === 0 ? (
                <div className="no-quests">No available quests</div>
              ) : (
                availableQuests.map(quest => (
                  <div key={quest.id} className="available-quest-card">
                    <QuestCard quest={quest} onAbandon={() => { /* Cannot abandon available quests */ }} />
                    <button 
                      className="accept-button"
                      onClick={() => handleAcceptQuest(quest.id)}
                    >
                      Accept Quest
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          
          {activeTab === 'completed' && (
            <div className="completed-quests">
              {completedQuests.length === 0 ? (
                <div className="no-quests">No completed quests</div>
              ) : (
                completedQuests.map(quest => (
                  <div key={quest.id} className="completed-quest-card">
                    <QuestCard quest={quest} onAbandon={() => { /* Cannot abandon completed quests */ }} />
                    <div className="completed-badge">✓ Completed</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      
      <style jsx>{`
        .quest-ui-overlay {
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
        
        .quest-ui-panel {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          border: 2px solid #475569;
          border-radius: 12px;
          width: 90%;
          max-width: 800px;
          height: 80%;
          max-height: 600px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        }
        
        .quest-ui-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 2px solid #475569;
          background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
          border-radius: 10px 10px 0 0;
        }
        
        .quest-ui-header h2 {
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
        
        .quest-tabs {
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
          border-bottom: 3px solid #3b82f6;
        }
        
        .quest-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        
        .quest-card {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          transition: all 0.2s;
        }
        
        .quest-card:hover {
          border-color: #475569;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .quest-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        
        .quest-title {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        
        .quest-icon {
          font-size: 18px;
        }
        
        .quest-name {
          color: #f1f5f9;
          font-weight: 600;
          font-size: 16px;
        }
        
        .quest-difficulty {
          font-size: 12px;
          font-weight: bold;
        }
        
        .abandon-button {
          background: #7f1d1d;
          color: white;
          border: none;
          border-radius: 4px;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-size: 16px;
        }
        
        .abandon-button:hover {
          background: #991b1b;
        }
        
        .quest-description {
          color: #cbd5e1;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 16px;
        }
        
        .quest-objectives {
          margin-bottom: 16px;
        }
        
        .quest-objective {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .quest-objective.completed {
          opacity: 0.7;
        }
        
        .quest-objective.completed .objective-text {
          text-decoration: line-through;
        }
        
        .objective-checkbox {
          color: #4ade80;
          font-weight: bold;
          width: 16px;
        }
        
        .objective-text {
          color: #e2e8f0;
          font-size: 14px;
          flex: 1;
        }
        
        .objective-progress {
          width: 60px;
          height: 6px;
          background: #334155;
          border-radius: 3px;
          overflow: hidden;
        }
        
        .progress-bar {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }
        
        .quest-rewards {
          border-top: 1px solid #334155;
          padding-top: 12px;
        }
        
        .rewards-title {
          color: #fbbf24;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .rewards-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .reward-exp {
          background: #065f46;
          color: #10b981;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .reward-gold {
          background: #92400e;
          color: #fbbf24;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .reward-item {
          background: #1e40af;
          color: #93c5fd;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .accept-button {
          background: #059669;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          margin-top: 12px;
          cursor: pointer;
          font-weight: 500;
          width: 100%;
        }
        
        .accept-button:hover {
          background: #047857;
        }
        
        .completed-badge {
          background: #059669;
          color: white;
          padding: 8px 16px;
          border-radius: 6px;
          text-align: center;
          margin-top: 12px;
          font-weight: 500;
        }
        
        .no-quests {
          text-align: center;
          color: #64748b;
          font-style: italic;
          padding: 40px;
        }
      `}</style>
    </div>
  );
}

export default QuestUI;
