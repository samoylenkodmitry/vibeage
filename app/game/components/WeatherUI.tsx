'use client';

import React from 'react';
import { WeatherCondition, WorldEvent } from '../systems/weatherEventSystem';

interface Props {
  currentWeather: WeatherCondition | null;
  activeEvents: WorldEvent[];
  isVisible: boolean;
}

function WeatherIcon({ weather }: { weather: WeatherCondition }) {
  const getWeatherIcon = () => {
    switch (weather.id) {
      case 'clear': return '☀️';
      case 'light_rain': return '🌧️';
      case 'heavy_storm': return '⛈️';
      case 'blizzard': return '❄️';
      case 'ethereal_mist': return '🌫️';
      case 'temporal_distortion': return '🌪️';
      case 'shadow_eclipse': return '🌌';
      case 'volcanic_ash': return '🌋';
      default: return '🌤️';
    }
  };

  return (
    <div className="weather-icon" title={weather.name}>
      {getWeatherIcon()}
    </div>
  );
}

function EventIcon({ event }: { event: WorldEvent }) {
  const getEventIcon = () => {
    switch (event.type) {
      case 'beneficial': return '✨';
      case 'dangerous': return '⚠️';
      case 'rare': return '🔮';
      default: return '📅';
    }
  };

  const getEventColor = () => {
    switch (event.type) {
      case 'beneficial': return '#4ade80';
      case 'dangerous': return '#f87171';
      case 'rare': return '#a78bfa';
      default: return '#94a3b8';
    }
  };

  return (
    <div 
      className="event-icon" 
      title={event.name}
      style={{ color: getEventColor() }}
    >
      {getEventIcon()}
    </div>
  );
}

function WeatherEffects({ weather }: { weather: WeatherCondition }) {
  const effects = [];
  
  if (weather.effects.visibility !== 1) {
    const visibility = Math.round(weather.effects.visibility * 100);
    effects.push(`Visibility: ${visibility}%`);
  }
  
  if (weather.effects.movementSpeed !== 1) {
    const speed = Math.round(weather.effects.movementSpeed * 100);
    effects.push(`Movement: ${speed}%`);
  }
  
  if (weather.effects.damage) {
    effects.push(`Damage: ${weather.effects.damage}/sec`);
  }
  
  if (weather.effects.healing) {
    effects.push(`Healing: +${weather.effects.healing}/sec`);
  }
  
  if (weather.effects.manaRegen) {
    effects.push(`Mana Regen: +${weather.effects.manaRegen}/sec`);
  }

  return (
    <div className="weather-effects">
      {effects.map((effect, index) => (
        <div key={index} className="effect-item">
          {effect}
        </div>
      ))}
    </div>
  );
}

function EventEffects({ event }: { event: WorldEvent }) {
  const effects = [];
  
  if (event.effects.experienceMultiplier !== 1) {
    const exp = Math.round(event.effects.experienceMultiplier * 100);
    effects.push(`XP: ${exp}%`);
  }
  
  if (event.effects.lootMultiplier !== 1) {
    const loot = Math.round(event.effects.lootMultiplier * 100);
    effects.push(`Loot: ${loot}%`);
  }
  
  if (event.effects.spawnRateMultiplier !== 1) {
    const spawn = Math.round(event.effects.spawnRateMultiplier * 100);
    effects.push(`Spawn Rate: ${spawn}%`);
  }
  
  // Note: difficultyMultiplier is not part of WorldEvent.effects interface
  // Remove this check or add the property to the interface definition

  return (
    <div className="event-effects">
      {effects.map((effect, index) => (
        <div key={index} className="effect-item">
          {effect}
        </div>
      ))}
    </div>
  );
}

export function WeatherUI({ currentWeather, activeEvents, isVisible }: Props) {
  if (!isVisible) return null;

  return (
    <div className="weather-ui">
      {/* Weather Display */}
      {currentWeather && (
        <div className="weather-display">
          <div className="weather-header">
            <WeatherIcon weather={currentWeather} />
            <div className="weather-info">
              <div className="weather-name">{currentWeather.name}</div>
              <div className="weather-duration">
                Duration: {Math.round(currentWeather.duration.min / 60)}-{Math.round(currentWeather.duration.max / 60)}m
              </div>
            </div>
          </div>
          <WeatherEffects weather={currentWeather} />
        </div>
      )}

      {/* Events Display */}
      {activeEvents.length > 0 && (
        <div className="events-display">
          <div className="events-header">Active Events</div>
          {activeEvents.map((event, index) => (
            <div key={index} className="event-item">
              <div className="event-header">
                <EventIcon event={event} />
                <div className="event-info">
                  <div className="event-name">{event.name}</div>
                  <div className="event-duration">
                    Duration: {Math.round(event.duration.min / 60)}-{Math.round(event.duration.max / 60)}m
                  </div>
                </div>
              </div>
              <EventEffects event={event} />
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .weather-ui {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 300px;
        }

        .weather-display, .events-display {
          background: rgba(15, 23, 42, 0.95);
          border: 2px solid #334155;
          border-radius: 12px;
          padding: 16px;
          backdrop-filter: blur(8px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .weather-header, .event-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .weather-icon, .event-icon {
          font-size: 24px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(51, 65, 85, 0.5);
          border-radius: 8px;
        }

        .weather-info, .event-info {
          flex: 1;
        }

        .weather-name, .event-name {
          color: #f1f5f9;
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
        }

        .weather-duration, .event-duration {
          color: #94a3b8;
          font-size: 12px;
        }

        .weather-effects, .event-effects {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .effect-item {
          color: #cbd5e1;
          font-size: 12px;
          padding: 4px 8px;
          background: rgba(51, 65, 85, 0.3);
          border-radius: 4px;
          border-left: 3px solid #3b82f6;
        }

        .events-header {
          color: #f1f5f9;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 12px;
          text-align: center;
          padding-bottom: 8px;
          border-bottom: 1px solid #334155;
        }

        .event-item {
          margin-bottom: 12px;
        }

        .event-item:last-child {
          margin-bottom: 0;
        }

        @media (max-width: 768px) {
          .weather-ui {
            top: 10px;
            right: 10px;
            max-width: 250px;
          }

          .weather-display, .events-display {
            padding: 12px;
          }

          .weather-icon, .event-icon {
            font-size: 20px;
            width: 28px;
            height: 28px;
          }

          .weather-name, .event-name {
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}

export default WeatherUI;
