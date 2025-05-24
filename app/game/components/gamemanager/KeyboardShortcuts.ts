import { useEffect } from 'react';

export const useKeyboardShortcuts = (
  setShowQuestUI: (value: boolean | ((prev: boolean) => boolean)) => void,
  setShowDungeonUI: (value: boolean | ((prev: boolean) => boolean)) => void,
  setShowWeatherUI: (value: boolean | ((prev: boolean) => boolean)) => void
) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'q' || event.key === 'Q') {
        setShowQuestUI(prev => !prev);
      } else if (event.key === 'd' || event.key === 'D') {
        setShowDungeonUI(prev => !prev);
      } else if (event.key === 'w' || event.key === 'W') {
        setShowWeatherUI(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setShowQuestUI, setShowDungeonUI, setShowWeatherUI]);
};
