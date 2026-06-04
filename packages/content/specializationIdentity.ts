import type { SpecializationId } from './specializations.js';

export type SpecializationIdentity = {
  fantasy: string;
  primaryLoop: string;
  mechanicTags: readonly string[];
  payoff: string;
};

export const SPECIALIZATION_IDENTITIES: Record<SpecializationId, SpecializationIdentity> = {
  arcanist: {
    fantasy: 'Arcane controller',
    primaryLoop: 'Create charges, bend space, and cash out long-range bursts.',
    mechanicTags: ['Arcane', 'Time', 'Pull', 'Swap', 'Burst'],
    payoff: 'Wins by deciding where and when a fight is allowed to happen.',
  },
  pyromancer: {
    fantasy: 'Burn detonator',
    primaryLoop: 'Keep enemies burning, then turn the burn into pack-wide explosions.',
    mechanicTags: ['Fire', 'Burn', 'Detonate', 'Zone', 'Knockback'],
    payoff: 'Wins when packs stay stacked long enough for fire to compound.',
  },
  berserker: {
    fantasy: 'Blood-rush bruiser',
    primaryLoop: 'Enter melee, pull victims closer, and turn danger into speed.',
    mechanicTags: ['Rage', 'Pull', 'Bleed', 'Attack Speed', 'Shield'],
    payoff: 'Feels strongest when surrounded and still moving forward.',
  },
  slayer: {
    fantasy: 'Execution duelist',
    primaryLoop: 'Mark, lunge, delay damage, then finish wounded targets.',
    mechanicTags: ['Execute', 'Mark', 'Blink', 'Delayed Damage', 'Cleave'],
    payoff: 'Rewards precise timing around enemy health thresholds.',
  },
  cardinal: {
    fantasy: 'Rescue healer',
    primaryLoop: 'Keep allies alive, swap endangered friends out, and stabilize the group.',
    mechanicTags: ['Heal', 'Shield', 'Ally Swap', 'Link', 'Regen'],
    payoff: 'Turns near-deaths into recoverable positions.',
  },
  theurge: {
    fantasy: 'Echo support',
    primaryLoop: 'Extend buffs, mirror danger, and chain aid through the party.',
    mechanicTags: ['Buff', 'Reflect', 'Chain Heal', 'Portal', 'Haste'],
    payoff: 'Wins by making the whole group better than its individual parts.',
  },
  hawkeye: {
    fantasy: 'Trap marksman',
    primaryLoop: 'Mark targets, control the firing lane, and punish grouped enemies.',
    mechanicTags: ['Mark', 'Trap', 'Root', 'Volley', 'Capture'],
    payoff: 'Controls packs before they reach the backline.',
  },
  phantom_ranger: {
    fantasy: 'Shadow trapper',
    primaryLoop: 'Disappear, leave decoys and mines, then fire through poison windows.',
    mechanicTags: ['Stealth', 'Decoy', 'Poison', 'Trap', 'Pierce'],
    payoff: 'Keeps enemies fighting the wrong target.',
  },
  templar_knight: {
    fantasy: 'Frontline anchor',
    primaryLoop: 'Hook enemies into guard range, silence packs, and absorb pressure.',
    mechanicTags: ['Hook', 'Taunt', 'Shield', 'Silence', 'Last Stand'],
    payoff: 'Makes the safest place for enemies also the worst place to stand.',
  },
  dark_avenger: {
    fantasy: 'Vengeance tank',
    primaryLoop: 'Bind enemies, reflect pain, and heal through shadow pressure.',
    mechanicTags: ['Tether', 'Reflect', 'Lifesteal', 'Taunt', 'Shadow'],
    payoff: 'Punishes attackers for focusing the tank.',
  },
  phoenix_knight: {
    fantasy: 'Holy fire charger',
    primaryLoop: 'Dive through enemies, burn the landing zone, and recover through shields.',
    mechanicTags: ['Charge', 'Burn', 'Shield', 'Rebirth', 'Ally Heal'],
    payoff: 'Turns aggressive dives into recoverable openings.',
  },
  evas_templar: {
    fantasy: 'Cleansing guardian',
    primaryLoop: 'Group allies, cleanse danger, and push threats away from the party.',
    mechanicTags: ['Cleanse', 'Shield', 'Heal', 'Knockback', 'Aura'],
    payoff: 'Wins by resetting bad positions before they become deaths.',
  },
  treasure_hunter: {
    fantasy: 'Lucky opportunist',
    primaryLoop: 'Set snares, expose valuable targets, and finish when luck opens a window.',
    mechanicTags: ['Loot Sense', 'Trap', 'Mark', 'Crit', 'Control'],
    payoff: 'Converts control openings into better rewards and burst chances.',
  },
  plains_walker: {
    fantasy: 'Poison wind skirmisher',
    primaryLoop: 'Poison first, vanish or dash through, then spread cutting pressure.',
    mechanicTags: ['Poison', 'Blink', 'Bleed', 'Speed', 'Stealth'],
    payoff: 'Wins by never staying where retaliation lands.',
  },
};

export function specializationIdentitySummary(specId: SpecializationId): string {
  const identity = SPECIALIZATION_IDENTITIES[specId];
  return `${identity.fantasy}: ${identity.primaryLoop}`;
}
