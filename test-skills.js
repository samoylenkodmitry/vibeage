// Script to debug the skill tree by testing getAvailableSkills
import { getAvailableSkills } from './shared/classSystem.js';

// Test for a mage (default class) at level 1 with just fireball unlocked
const mageLevel1 = getAvailableSkills('mage', 1, ['fireball']);
console.log('Mage (Level 1) with fireball unlocked. Available skills:', mageLevel1);

// Test for a mage at level 2 with fireball unlocked
const mageLevel2 = getAvailableSkills('mage', 2, ['fireball']);
console.log('Mage (Level 2) with fireball unlocked. Available skills:', mageLevel2);

// Test for a mage at level 3 with fireball and waterSplash unlocked
const mageLevel3 = getAvailableSkills('mage', 3, ['fireball', 'waterSplash']);
console.log('Mage (Level 3) with fireball and waterSplash unlocked. Available skills:', mageLevel3);

// Test for a warrior at level 1 with no skills
const warriorLevel1 = getAvailableSkills('warrior', 1, []);
console.log('Warrior (Level 1) with no skills. Available skills:', warriorLevel1);

// Test for a warrior at level 2 with no skills
const warriorLevel2 = getAvailableSkills('warrior', 2, []);
console.log('Warrior (Level 2) with no skills. Available skills:', warriorLevel2);
