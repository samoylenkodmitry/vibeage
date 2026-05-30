import { ITEMS } from '../../../packages/content/items';

/**
 * Maps a content `weaponType` to a KayKit weapon GLB and the skeleton socket it
 * mounts to. KayKit characters carry an empty `handslot.r` bone authored exactly
 * for these props, so a weapon parented there with identity transform sits in
 * the grip and follows every animation. Swap models later by editing the map.
 *
 * KayKit has no mace/orb/bow per se, so the nearest fit stands in (axe for the
 * blunt mace, wand for the caster orb, crossbow for the bow).
 */
export const WEAPON_SOCKET = 'handslot.r';

const WEAPON_GLB: Record<string, string> = {
  sword: '/models/weapons/kaykit/sword_1handed.glb',
  dagger: '/models/weapons/kaykit/dagger.glb',
  staff: '/models/weapons/kaykit/staff.glb',
  mace: '/models/weapons/kaykit/axe_1handed.glb',
  orb: '/models/weapons/kaykit/wand.glb',
  bow: '/models/weapons/kaykit/crossbow_1handed.glb',
};

export function weaponModelPath(weaponType: string | undefined): string | null {
  if (!weaponType) return null;
  return WEAPON_GLB[weaponType] ?? null;
}

/** Resolve the main-hand weaponType from a player's equipment map. */
export function equippedWeaponType(equipment: Record<string, string> | undefined): string | undefined {
  const itemId = equipment?.MAIN_HAND;
  if (!itemId) return undefined;
  return ITEMS[itemId]?.equip?.weaponType;
}
