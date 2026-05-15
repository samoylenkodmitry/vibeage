import { useEffect, useState, type MutableRefObject, type ReactElement } from 'react';
import { GAME_ZONES, type Zone } from '../../../../packages/content/zones';
import { WORLD_LANDMARKS, type WorldLandmark } from '../../../../packages/content/worldFeatures';
import type { PlayerEntity } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';

type MapPanelProps = {
  player: PlayerEntity | null;
  cameraAngleRef?: MutableRefObject<number>;
};

const VIEW_PADDING = 0.08;
const WORLD_BOUNDS = computeWorldBounds(GAME_ZONES, WORLD_LANDMARKS);
const TICK_SPACING = chooseTickSpacing(WORLD_BOUNDS);

export function MapPanel({ player, cameraAngleRef }: MapPanelProps) {
  const bounds = WORLD_BOUNDS;
  const px = player?.position.x ?? 0;
  const pz = player?.position.z ?? 0;
  const cameraYaw = useCameraYaw(cameraAngleRef);
  const fallbackYaw = player?.rotation?.y ?? 0;
  const yaw = cameraAngleRef ? cameraYaw : fallbackYaw;
  const arrowDir = {
    x: Math.sin(yaw),
    z: Math.cos(yaw),
  };
  const tickSpacing = TICK_SPACING;
  const panelRef = useDraggablePanel<HTMLElement>();

  return (
    <section ref={panelRef} className="map-panel" aria-label="World map">
      <div className="panel-title">
        <strong>World Map</strong>
        <span>{Math.round(px)}, {Math.round(pz)}</span>
      </div>
      <svg
        className="map-svg"
        viewBox={`${bounds.minX} ${bounds.minZ} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Top-down view of the world"
      >
        <defs>
          <radialGradient id="map-bg-gradient" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0e2030" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#02060c" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect x={bounds.minX} y={bounds.minZ} width={bounds.width} height={bounds.height} fill="url(#map-bg-gradient)" />
        {tickSpacing > 0 && renderGridLines(bounds, tickSpacing)}
        {GAME_ZONES.map((zone) => (
          <ZoneShape key={zone.id} zone={zone} viewWidth={bounds.width} />
        ))}
        {WORLD_LANDMARKS.map((landmark) => (
          <LandmarkDot key={landmark.id} landmark={landmark} viewWidth={bounds.width} />
        ))}
        <PlayerMarker x={px} z={pz} dirX={arrowDir.x} dirZ={arrowDir.z} viewWidth={bounds.width} />
      </svg>
      <ol className="map-legend">
        <li><span className="map-legend-dot map-legend-dot--player" />You</li>
        <li><span className="map-legend-dot map-legend-dot--zone" />Zone</li>
        <li><span className="map-legend-dot map-legend-dot--mega" />Mega</li>
        <li><span className="map-legend-dot map-legend-dot--landmark" />Landmark</li>
      </ol>
    </section>
  );
}

function useCameraYaw(angleRef?: MutableRefObject<number>): number {
  const [yaw, setYaw] = useState(angleRef?.current ?? 0);

  useEffect(() => {
    if (!angleRef) {
      return undefined;
    }
    let frame = 0;
    const tick = () => {
      const next = angleRef.current;
      setYaw((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [angleRef]);

  return yaw;
}

function ZoneShape({ zone, viewWidth }: { zone: Zone; viewWidth: number }) {
  const labelSize = Math.max(viewWidth * 0.005, zone.radius * 0.18);
  return (
    <g>
      <circle
        cx={zone.position.x}
        cy={zone.position.z}
        r={zone.radius}
        fill="rgba(141,233,215,0.08)"
        stroke="rgba(141,233,215,0.55)"
        strokeWidth={Math.max(viewWidth * 0.0008, 1)}
      />
      <text
        x={zone.position.x}
        y={zone.position.z + labelSize * 0.4}
        fontSize={labelSize}
        textAnchor="middle"
        fill="#c4f1e2"
      >
        {zone.name}
      </text>
    </g>
  );
}

function LandmarkDot({ landmark, viewWidth }: { landmark: WorldLandmark; viewWidth: number }) {
  const dotSize = Math.max(viewWidth * 0.006, 600);
  const isMega = landmark.mega === true;
  return (
    <g>
      <circle
        cx={landmark.position.x}
        cy={landmark.position.z}
        r={isMega ? dotSize * 1.6 : dotSize}
        fill={isMega ? '#facc15' : '#fde68a'}
        opacity={isMega ? 0.95 : 0.7}
      />
      <text
        x={landmark.position.x + dotSize * 1.8}
        y={landmark.position.z}
        fontSize={dotSize * 1.6}
        fill={isMega ? '#fef3c7' : '#fde68a'}
        dominantBaseline="middle"
      >
        {landmark.name}
      </text>
    </g>
  );
}

function PlayerMarker({
  x,
  z,
  dirX,
  dirZ,
  viewWidth,
}: {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  viewWidth: number;
}) {
  const size = Math.max(viewWidth * 0.012, 4_000);
  const tipX = x + dirX * size;
  const tipZ = z + dirZ * size;
  const baseLx = x - dirZ * size * 0.55 - dirX * size * 0.32;
  const baseLz = z + dirX * size * 0.55 - dirZ * size * 0.32;
  const baseRx = x + dirZ * size * 0.55 - dirX * size * 0.32;
  const baseRz = z - dirX * size * 0.55 - dirZ * size * 0.32;

  return (
    <g>
      <circle cx={x} cy={z} r={size * 1.6} fill="rgba(117,245,200,0.16)" />
      <polygon
        points={`${tipX},${tipZ} ${baseLx},${baseLz} ${baseRx},${baseRz}`}
        fill="#75f5c8"
        stroke="#04100d"
        strokeWidth={Math.max(viewWidth * 0.0006, 600)}
      />
    </g>
  );
}

function renderGridLines(
  bounds: { minX: number; minZ: number; width: number; height: number },
  step: number,
): ReactElement[] {
  const lines: ReactElement[] = [];
  const stroke = Math.max(bounds.width * 0.0004, 200);
  for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.minX + bounds.width; x += step) {
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={bounds.minZ}
        x2={x}
        y2={bounds.minZ + bounds.height}
        stroke="rgba(141,233,215,0.12)"
        strokeWidth={stroke}
      />,
    );
  }
  for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.minZ + bounds.height; z += step) {
    lines.push(
      <line
        key={`h-${z}`}
        x1={bounds.minX}
        y1={z}
        x2={bounds.minX + bounds.width}
        y2={z}
        stroke="rgba(141,233,215,0.12)"
        strokeWidth={stroke}
      />,
    );
  }
  return lines;
}

function chooseTickSpacing(bounds: { width: number }): number {
  const target = bounds.width / 8;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const candidates = [1, 2, 5, 10];
  for (const c of candidates) {
    if (c * magnitude >= target) {
      return c * magnitude;
    }
  }
  return 10 * magnitude;
}

function computeWorldBounds(zones: readonly Zone[], landmarks: readonly WorldLandmark[]): {
  minX: number;
  minZ: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const zone of zones) {
    minX = Math.min(minX, zone.position.x - zone.radius);
    maxX = Math.max(maxX, zone.position.x + zone.radius);
    minZ = Math.min(minZ, zone.position.z - zone.radius);
    maxZ = Math.max(maxZ, zone.position.z + zone.radius);
  }
  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.position.x - landmark.radius);
    maxX = Math.max(maxX, landmark.position.x + landmark.radius);
    minZ = Math.min(minZ, landmark.position.z - landmark.radius);
    maxZ = Math.max(maxZ, landmark.position.z + landmark.radius);
  }
  if (!Number.isFinite(minX)) {
    return { minX: -500_000, minZ: -500_000, width: 1_000_000, height: 1_000_000 };
  }
  const width = maxX - minX;
  const height = maxZ - minZ;
  const padX = width * VIEW_PADDING;
  const padZ = height * VIEW_PADDING;
  return {
    minX: minX - padX,
    minZ: minZ - padZ,
    width: width + padX * 2,
    height: height + padZ * 2,
  };
}
