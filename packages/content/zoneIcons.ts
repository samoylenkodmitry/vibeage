/**
 * Zone landscape thumbnails. Generated 384×216 (16:9) painterly
 * panoramas shown behind the "You enter <Zone>" banner + as a small
 * thumb next to the current-zone HUD chip. Path/slug convention
 * mirrors classes / races / specs / actions / npcs.
 */
export function zoneIconSlug(zoneId: string): string {
  return zoneId.replace(/_/g, '-');
}

export function zoneIconPath(zoneId: string): string {
  return `/game/zones/zone-icon-${zoneIconSlug(zoneId)}.png`;
}
