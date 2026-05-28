import type { CharacterRace } from './races.js';

/**
 * Race portrait icons. Generated head-and-shoulders busts (256×256)
 * shown next to each race option in the character-create form.
 * Path convention mirrors classes / specs / actions: one PNG per id
 * under `/game/races/`, slug = race id with underscores → hyphens.
 */
const RACE_ICON_SLUGS: Record<CharacterRace, string> = {
  human: 'human',
  elf: 'elf',
  dark_elf: 'dark-elf',
  orc: 'orc',
  dwarf: 'dwarf',
};

export function raceIconPath(race: CharacterRace): string {
  return `/game/races/race-icon-${RACE_ICON_SLUGS[race]}.png`;
}
