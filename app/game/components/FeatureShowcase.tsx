'use client';

import React, { useState, useEffect } from 'react';

interface Props {
  onFeatureSelect: (feature: string) => void;
}

export function FeatureShowcase({ onFeatureSelect }: Props) {
  const [currentFeature, setCurrentFeature] = useState(0);
  
  const features = [
    {
      id: 'zones',
      title: '🌍 14 Unique Zones',
      description: 'Explore diverse biomes from Volcanic Wastes to Celestial Peaks',
      details: 'Each zone features unique mobs, environmental objects, and materials',
      color: '#10b981'
    },
    {
      id: 'quests',
      title: '🎯 Quest System',
      description: 'Engage with NPCs and complete meaningful quests',
      details: 'Main quests, side quests, daily quests, and epic quest chains',
      color: '#3b82f6'
    },
    {
      id: 'weather',
      title: '🌦️ Dynamic Weather',
      description: 'Experience changing weather that affects gameplay',
      details: '8 weather conditions with visual effects and mechanical impact',
      color: '#06b6d4'
    },
    {
      id: 'dungeons',
      title: '🏰 Instanced Dungeons',
      description: 'Challenge yourself in multi-room dungeon instances',
      details: '3 themed dungeons with unique mechanics and exclusive rewards',
      color: '#8b5cf6'
    },
    {
      id: 'items',
      title: '🎒 Enhanced Items',
      description: 'Discover 40+ new weapons, armor, and materials',
      details: 'Zone-specific drops, dungeon rewards, and quest items',
      color: '#f59e0b'
    },
    {
      id: 'events',
      title: '⭐ World Events',
      description: 'Participate in special world-wide events',
      details: 'Double XP, rare spawns, merchant caravans, and more',
      color: '#ef4444'
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [features.length]);

  const handleFeatureClick = (feature: any) => {
    onFeatureSelect(feature.id);
    setCurrentFeature(features.findIndex(f => f.id === feature.id));
  };

  const currentFeatureData = features[currentFeature];

  return (
    <div className="feature-showcase">
      <div className="showcase-header">
        <h2>🎮 World Expansion Features</h2>
        <p>Discover the new content that makes this world come alive!</p>
      </div>

      <div className="feature-highlight">
        <div 
          className="feature-card"
          style={{ borderColor: currentFeatureData.color }}
        >
          <div className="feature-content">
            <h3 style={{ color: currentFeatureData.color }}>
              {currentFeatureData.title}
            </h3>
            <p className="feature-description">
              {currentFeatureData.description}
            </p>
            <p className="feature-details">
              {currentFeatureData.details}
            </p>
          </div>
          <div className="feature-progress">
            <div 
              className="progress-bar"
              style={{ backgroundColor: currentFeatureData.color }}
            />
          </div>
        </div>
      </div>

      <div className="feature-grid">
        {features.map((feature, index) => (
          <button
            key={feature.id}
            className={`feature-button ${index === currentFeature ? 'active' : ''}`}
            onClick={() => handleFeatureClick(feature)}
            style={{
              borderColor: index === currentFeature ? feature.color : 'transparent',
              backgroundColor: index === currentFeature ? `${feature.color}20` : 'transparent'
            }}
          >
            <div className="feature-icon">
              {feature.title.split(' ')[0]}
            </div>
            <div className="feature-name">
              {feature.title.split(' ').slice(1).join(' ')}
            </div>
          </button>
        ))}
      </div>

      <div className="controls-guide">
        <h4>🎮 Controls</h4>
        <div className="controls-grid">
          <div className="control-item">
            <kbd>Q</kbd>
            <span>Quest Log</span>
          </div>
          <div className="control-item">
            <kbd>D</kbd>
            <span>Dungeons</span>
          </div>
          <div className="control-item">
            <kbd>W</kbd>
            <span>Weather</span>
          </div>
          <div className="control-item">
            <kbd>WASD</kbd>
            <span>Movement</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .feature-showcase {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          border: 2px solid #334155;
          border-radius: 16px;
          padding: 32px;
          max-width: 600px;
          width: 90%;
          z-index: 1000;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
        }

        .showcase-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .showcase-header h2 {
          color: #f1f5f9;
          font-size: 28px;
          font-weight: bold;
          margin: 0 0 12px 0;
        }

        .showcase-header p {
          color: #94a3b8;
          font-size: 16px;
          margin: 0;
        }

        .feature-highlight {
          margin-bottom: 32px;
        }

        .feature-card {
          background: rgba(15, 23, 42, 0.8);
          border: 2px solid;
          border-radius: 12px;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .feature-content h3 {
          font-size: 24px;
          font-weight: bold;
          margin: 0 0 12px 0;
        }

        .feature-description {
          color: #e2e8f0;
          font-size: 16px;
          margin: 0 0 8px 0;
          font-weight: 500;
        }

        .feature-details {
          color: #94a3b8;
          font-size: 14px;
          margin: 0;
          line-height: 1.5;
        }

        .feature-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(51, 65, 85, 0.5);
        }

        .progress-bar {
          height: 100%;
          width: 100%;
          animation: progressFill 4s ease-in-out infinite;
        }

        @keyframes progressFill {
          0% { width: 0%; }
          90% { width: 100%; }
          100% { width: 100%; }
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 32px;
        }

        .feature-button {
          background: transparent;
          border: 2px solid;
          border-radius: 8px;
          padding: 16px 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: center;
        }

        .feature-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .feature-icon {
          font-size: 24px;
          margin-bottom: 8px;
        }

        .feature-name {
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 500;
        }

        .feature-button.active .feature-name {
          color: #f1f5f9;
          font-weight: 600;
        }

        .controls-guide {
          border-top: 1px solid #334155;
          padding-top: 24px;
        }

        .controls-guide h4 {
          color: #f1f5f9;
          font-size: 18px;
          margin: 0 0 16px 0;
          text-align: center;
        }

        .controls-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 12px;
        }

        .control-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .control-item kbd {
          background: #374151;
          color: #f3f4f6;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: bold;
          border: 1px solid #4b5563;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .control-item span {
          color: #94a3b8;
          font-size: 11px;
          text-align: center;
        }

        @media (max-width: 768px) {
          .feature-showcase {
            padding: 24px;
            width: 95%;
          }

          .showcase-header h2 {
            font-size: 24px;
          }

          .feature-content h3 {
            font-size: 20px;
          }

          .feature-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .controls-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default FeatureShowcase;
