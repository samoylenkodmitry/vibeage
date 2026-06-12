import { useMemo } from 'react';
import { WORLD_LANDMARKS, type WorldLandmark } from '../../../../packages/content/worldFeatures';

type Marker = { x: number; z: number };

/**
 * GM map travel — teleport to the dropped pin, or pick any named place from
 * the dropdown (nearest first). The server re-checks GM on every teleport.
 */
export function GmMapTravel({ pin, px, pz, onGmTeleport }: {
  pin: Marker | null;
  px: number;
  pz: number;
  onGmTeleport: (target: Marker) => void;
}) {
  // Quantize the sort anchor so the list doesn't reshuffle every step.
  const qx = Math.round(px / 100) * 100;
  const qz = Math.round(pz / 100) * 100;
  // Squared distances — same ordering, no sqrt per comparison (review).
  const places = useMemo(() => {
    const distSq = (lm: WorldLandmark) => (lm.position.x - qx) ** 2 + (lm.position.z - qz) ** 2;
    return [...WORLD_LANDMARKS].sort((a, b) => distSq(a) - distSq(b));
  }, [qx, qz]);
  return (
    <>
      {pin && (
        <button type="button" onClick={() => onGmTeleport(pin)}>Teleport</button>
      )}
      <select
        aria-label="Teleport to place"
        value=""
        onChange={(event) => {
          const place = WORLD_LANDMARKS.find((lm) => lm.id === event.target.value);
          if (place) onGmTeleport(landingPointFor(place));
        }}
      >
        <option value="">Places…</option>
        {places.map((lm) => (
          <option key={lm.id} value={lm.id}>{lm.mega ? '◆ ' : ''}{lm.name}</option>
        ))}
      </select>
    </>
  );
}

/** Land just outside the footprint so you arrive LOOKING at the place, not
 *  standing inside its geometry. Towns: straight onto the open plaza. */
function landingPointFor(place: WorldLandmark): Marker {
  if (place.kind === 'town') return { x: place.position.x + 9, z: place.position.z + 9 };
  const offset = (place.radius * (place.mega ? 1.3 : 1.05) + 6) * 0.71;
  return { x: place.position.x + offset, z: place.position.z + offset };
}
