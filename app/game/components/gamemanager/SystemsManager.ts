import { QuestManager } from '../../systems/questSystem';
import { WeatherEventManager } from '../../systems/weatherEventSystem';
import { DungeonManager } from '../../systems/dungeonSystem';

export class SystemsManager {
  private questSystem: QuestManager;
  private weatherSystem: WeatherEventManager;
  private dungeonSystem: DungeonManager;

  constructor() {
    this.questSystem = new QuestManager();
    this.weatherSystem = new WeatherEventManager();
    this.dungeonSystem = new DungeonManager();
  }

  // Quest System Methods
  getNearbyNPCs(playerPosition: { x: number; y: number; z: number }, radius: number) {
    return this.questSystem.getNearbyNPCs(playerPosition, radius);
  }

  getNPC(npcId: string) {
    return this.questSystem.getNPC(npcId);
  }

  progressQuest(playerId: string, questId: string, objectiveType: string, targetId: string, amount: number = 1) {
    return this.questSystem.progressQuest(playerId, questId, objectiveType, targetId, amount);
  }

  // Weather System Methods
  getCurrentWeather() {
    return this.weatherSystem.getCurrentWeather();
  }

  getActiveEvents() {
    return this.weatherSystem.getActiveEvents();
  }

  updateWeather() {
    this.weatherSystem.update();
  }

  // Dungeon System Methods
  getDungeonInstance(instanceId: string) {
    return this.dungeonSystem.getInstance(instanceId);
  }

  cleanupExpiredDungeonInstances() {
    this.dungeonSystem.cleanupExpiredInstances();
  }

  // Get system instances for direct access if needed
  getQuestSystem() {
    return this.questSystem;
  }

  getWeatherSystem() {
    return this.weatherSystem;
  }

  getDungeonSystem() {
    return this.dungeonSystem;
  }
}
