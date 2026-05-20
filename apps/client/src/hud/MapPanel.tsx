import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { listMiniBosses, type MiniBossSpec } from '../../../../packages/content/miniBosses';
import { GAME_ZONES, type Zone } from '../../../../packages/content/zones';
import { WORLD_LANDMARKS, type WorldLandmark } from '../../../../packages/content/worldFeatures';
import type { EnemyEntity, PlayerEntity } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';
import { openWikiAt } from './wikiNavBus';

type Marker = { x: number; z: number };

type MapPanelProps = {
  player: PlayerEntity | null;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: Marker | null;
  onSetNavigationMarker?: (marker: Marker | null) => void;
  enemies?: Record<string, EnemyEntity>;
};

const VIEW_PADDING = 0.08;
const WORLD_BOUNDS = computeWorldBounds(GAME_ZONES, WORLD_LANDMARKS);
const TICK_SPACING = chooseTickSpacing(WORLD_BOUNDS);
const MIN_ZOOM = 1;
const MAX_ZOOM = 200;
// Default zoom bumped 12 → 40: at 12 the player's surroundings were
// the size of a fingernail and labels for neighbouring objects all
// collapsed onto one pixel. 40 lines the on-map scale up with what
// the player actually sees in the 3D world.
const INITIAL_ZOOM = 40;
const DRAG_PIXEL_THRESHOLD = 5;

type ViewState = {
  zoom: number;
  centerX: number;
  centerZ: number;
};

export function MapPanel({ player, cameraAngleRef, navigationMarker, onSetNavigationMarker, enemies }: MapPanelProps) {
  const px = player?.position.x ?? 0;
  const pz = player?.position.z ?? 0;
  const cameraYaw = useCameraYaw(cameraAngleRef);
  const fallbackYaw = player?.rotation?.y ?? 0;
  const yaw = cameraAngleRef ? cameraYaw : fallbackYaw;
  const arrowDir = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const panelRef = useDraggablePanel<HTMLElement>('map');
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Open zoomed in on the player's current position. Whole-world view
  // (zoom=1) was too far out to be useful for navigation.
  const [view, setView] = useState<ViewState>(() => ({
    zoom: INITIAL_ZOOM,
    centerX: px,
    centerZ: pz,
  }));

  const viewWidth = WORLD_BOUNDS.width / view.zoom;
  const viewHeight = WORLD_BOUNDS.height / view.zoom;
  const viewMinX = view.centerX - viewWidth / 2;
  const viewMinZ = view.centerZ - viewHeight / 2;
  const tickSpacing = chooseTickSpacingForWidth(viewWidth);

  const handlers = useMapInteraction({ svgRef, view, viewMinX, viewMinZ, viewWidth, viewHeight, setView, onSetNavigationMarker });
  const recenterOnPlayer = () => setView((prev) => ({ ...prev, centerX: px, centerZ: pz }));
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <section ref={panelRef} className={`map-panel${fullscreen ? ' map-panel--fullscreen' : ''}`} aria-label="World map">
      <div className="panel-title">
        <strong>World Map</strong>
        <span>{Math.round(px)}, {Math.round(pz)}</span>
      </div>
      <div className="map-toolbar">
        <button type="button" onClick={() => setView((p) => ({ ...p, zoom: Math.min(MAX_ZOOM, p.zoom * 1.5) }))}>+</button>
        <button type="button" onClick={() => setView((p) => ({ ...p, zoom: Math.max(MIN_ZOOM, p.zoom / 1.5) }))}>−</button>
        <button type="button" onClick={recenterOnPlayer}>Center</button>
        <button type="button" onClick={() => setFullscreen((prev) => !prev)}>
          {fullscreen ? 'Windowed' : 'Fullscreen'}
        </button>
        {navigationMarker && (
          <button type="button" onClick={() => onSetNavigationMarker?.(null)}>Clear pin</button>
        )}
        <span className="map-toolbar-hint">click: drop pin · drag: pan · wheel: zoom · right-click: clear</span>
      </div>
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`${viewMinX} ${viewMinZ} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Top-down view of the world"
        {...handlers}
      >
        <defs>
          <radialGradient id="map-bg-gradient" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0e2030" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#02060c" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect x={viewMinX} y={viewMinZ} width={viewWidth} height={viewHeight} fill="url(#map-bg-gradient)" />
        {tickSpacing > 0 && renderGridLines({ minX: viewMinX, minZ: viewMinZ, width: viewWidth, height: viewHeight }, tickSpacing)}
        {GAME_ZONES.map((zone) => (
          <ZoneShape key={zone.id} zone={zone} viewWidth={viewWidth} />
        ))}
        {renderLandmarks(viewWidth)}
        <BossMarkers enemies={enemies} viewWidth={viewWidth} />
        {navigationMarker && <NavigationDot marker={navigationMarker} viewWidth={viewWidth} />}
        <PlayerMarker x={px} z={pz} dirX={arrowDir.x} dirZ={arrowDir.z} viewWidth={viewWidth} />
      </svg>
      <ol className="map-legend">
        <li><span className="map-legend-dot map-legend-dot--player" />You</li>
        <li><span className="map-legend-dot map-legend-dot--zone" />Zone</li>
        <li><span className="map-legend-dot map-legend-dot--mega" />Mega</li>
        <li><span className="map-legend-dot map-legend-dot--landmark" />Landmark</li>
        <li><span className="map-legend-dot map-legend-dot--pin" />Pin</li>
        <li><span className="map-legend-dot map-legend-dot--boss-alive" />Boss (alive)</li>
        <li><span className="map-legend-dot map-legend-dot--boss-dead" />Boss (slain)</li>
      </ol>
    </section>
  );
}

type MapInteractionInput = {
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  view: ViewState;
  viewMinX: number;
  viewMinZ: number;
  viewWidth: number;
  viewHeight: number;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  onSetNavigationMarker?: (marker: Marker | null) => void;
};

function useMapInteraction(input: MapInteractionInput) {
  const dragRef = useRef<{
    pointerId: number;
    moved: number;
    lastClientX: number;
    lastClientY: number;
    pixelsPerWorldUnit: number;
  } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const { svgRef, view, viewWidth, setView, onSetNavigationMarker } = input;

  const screenToWorld = (event: { clientX: number; clientY: number }): Marker | null => {
    return svgClientToWorld(svgRef.current, event);
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    applyWheelZoomToView(svgRef.current, event, setView);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 2) {
      event.preventDefault();
      onSetNavigationMarker?.(null);
      return;
    }
    if (event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    if (event.pointerType === 'touch') {
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      svg.setPointerCapture(event.pointerId);
      if (pinchRef.current.size >= 2) {
        dragRef.current = null;
        startPinch(pinchRef.current, pinchStartRef, view.zoom);
        return;
      }
    }
    const rect = svg.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      moved: 0,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      pixelsPerWorldUnit: rect.width / viewWidth,
    };
    svg.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (handlePinchMove(event, pinchRef.current, pinchStartRef, setView)) {
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastClientX;
    const dy = event.clientY - drag.lastClientY;
    drag.moved += Math.hypot(dx, dy);
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    if (drag.moved < DRAG_PIXEL_THRESHOLD) return;
    setView((prev) => ({
      ...prev,
      centerX: prev.centerX - dx / drag.pixelsPerWorldUnit,
      centerZ: prev.centerZ - dy / drag.pixelsPerWorldUnit,
    }));
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') {
      pinchRef.current.delete(event.pointerId);
      if (pinchRef.current.size < 2) {
        pinchStartRef.current = null;
      }
    }
    try { svgRef.current?.releasePointerCapture(event.pointerId); } catch { /* released */ }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasClick = drag.moved < DRAG_PIXEL_THRESHOLD;
    dragRef.current = null;
    if (wasClick && onSetNavigationMarker) {
      const target = screenToWorld(event);
      if (target) onSetNavigationMarker(target);
    }
  };

  const onContextMenu = (event: ReactPointerEvent<SVGSVGElement>) => event.preventDefault();

  return { onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onContextMenu };
}

function applyWheelZoomToView(
  svg: SVGSVGElement | null,
  event: ReactWheelEvent<SVGSVGElement>,
  setView: React.Dispatch<React.SetStateAction<ViewState>>,
): void {
  const world = svgClientToWorld(svg, event);
  if (!svg || !world) return;
  const rect = svg.getBoundingClientRect();
  const sx = (event.clientX - rect.left) / rect.width;
  const sy = (event.clientY - rect.top) / rect.height;
  const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
  setView((prev) => {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor));
    const nextWidth = WORLD_BOUNDS.width / nextZoom;
    const nextHeight = WORLD_BOUNDS.height / nextZoom;
    return {
      zoom: nextZoom,
      centerX: world.x + (0.5 - sx) * nextWidth,
      centerZ: world.z + (0.5 - sy) * nextHeight,
    };
  });
}

function pinchDistance(points: Map<number, { x: number; y: number }>): number {
  const pts = Array.from(points.values());
  if (pts.length < 2) return 1;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
}

function startPinch(
  points: Map<number, { x: number; y: number }>,
  pinchStartRef: React.MutableRefObject<{ distance: number; zoom: number } | null>,
  zoom: number,
): void {
  pinchStartRef.current = { distance: pinchDistance(points), zoom };
}

function handlePinchMove(
  event: ReactPointerEvent<SVGSVGElement>,
  points: Map<number, { x: number; y: number }>,
  pinchStartRef: React.MutableRefObject<{ distance: number; zoom: number } | null>,
  setView: React.Dispatch<React.SetStateAction<ViewState>>,
): boolean {
  if (event.pointerType !== 'touch' || !points.has(event.pointerId)) {
    return false;
  }
  points.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (points.size < 2 || !pinchStartRef.current) {
    return true;
  }
  const ratio = pinchDistance(points) / pinchStartRef.current.distance;
  setView((prev) => ({
    ...prev,
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartRef.current!.zoom * ratio)),
  }));
  return true;
}

function svgClientToWorld(
  svg: SVGSVGElement | null,
  event: { clientX: number; clientY: number },
): Marker | null {
  if (!svg) return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const inverse = matrix.inverse();
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const transformed = pt.matrixTransform(inverse);
  return { x: transformed.x, z: transformed.y };
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
  // Zone label: scale with viewport width (~1.6% of viewport),
  // but suppress when the zone footprint is too small to comfortably
  // host the text — at deep zoom-outs, label clutter is worse than
  // having to hover the dot.
  const labelSize = viewWidth * 0.016;
  const minViewportRatio = 0.06;
  const zoneFitsLabel = zone.radius * 2 > viewWidth * minViewportRatio;
  return (
    <g>
      <circle
        cx={zone.position.x}
        cy={zone.position.z}
        r={zone.radius}
        fill="rgba(141,233,215,0.08)"
        stroke="rgba(141,233,215,0.55)"
        strokeWidth={viewWidth * 0.0008}
      />
      {zoneFitsLabel && (
        <text
          x={zone.position.x}
          y={zone.position.z + labelSize * 0.4}
          fontSize={labelSize}
          textAnchor="middle"
          fill="#c4f1e2"
        >
          {zone.name}
        </text>
      )}
    </g>
  );
}

function LandmarkDot({
  landmark,
  viewWidth,
  hideLabel,
}: {
  landmark: WorldLandmark;
  viewWidth: number;
  hideLabel: boolean;
}) {
  // Dot + label sized as fractions of the visible viewport so they
  // stay legible across zoom levels. The old `Math.max(viewWidth *
  // 0.006, 600)` floor was in world units — at high zoom 600 world-
  // units painted across the whole canvas.
  const dotSize = viewWidth * 0.012;
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
      {!hideLabel && (
        <text
          x={landmark.position.x + dotSize * 1.8}
          y={landmark.position.z}
          fontSize={dotSize * 1.6}
          fill={isMega ? '#fef3c7' : '#fde68a'}
          dominantBaseline="middle"
        >
          {landmark.name}
        </text>
      )}
    </g>
  );
}

/**
 * PR W — mini-boss pins. The boss is alive iff a live enemy with
 * isMiniBoss === true and matching bossId exists in the current
 * snapshot. Click the pin → Wiki Bosses tab. Position comes from
 * the boss content registry (PR V), not the live enemy snapshot,
 * so a slain boss still shows where it used to stand.
 */
function BossMarkers({ enemies, viewWidth }: { enemies?: Record<string, EnemyEntity>; viewWidth: number }) {
  const aliveBossIds = new Set<string>();
  for (const e of Object.values(enemies ?? {})) {
    if (e.isMiniBoss && e.bossId && e.isAlive) aliveBossIds.add(e.bossId);
  }
  return (
    <>
      {listMiniBosses().map((boss) => {
        const zone = GAME_ZONES.find((z) => z.miniBoss?.id === boss.id);
        if (!zone?.miniBoss?.position) return null;
        const pos = zone.miniBoss.position;
        const alive = aliveBossIds.has(boss.id);
        return <BossDot key={boss.id} boss={boss} x={pos.x} z={pos.z} alive={alive} viewWidth={viewWidth} />;
      })}
    </>
  );
}

function BossDot({
  boss, x, z, alive, viewWidth,
}: { boss: MiniBossSpec; x: number; z: number; alive: boolean; viewWidth: number }) {
  // Dot + label sized as fractions of the visible viewport so they
  // scale across zoom levels. The old \`Math.max(..., 900)\` floor was
  // in world units and overflowed the viewport at every default
  // zoom — 900 world units at zoom 40 is ~36% of the visible map.
  const size = viewWidth * 0.012;
  const fill = alive ? '#fbbf24' : '#475569';
  const halo = alive ? 'rgba(251,191,36,0.28)' : 'rgba(71,85,105,0.22)';
  return (
    <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openWikiAt('bosses', boss.id); }}>
      <circle cx={x} cy={z} r={size * 1.8} fill={halo} />
      <circle cx={x} cy={z} r={size * 0.85} fill={fill} stroke="#04100d" strokeWidth={viewWidth * 0.0006} />
      <text
        x={x}
        y={z + size * 2.4}
        textAnchor="middle"
        fill={alive ? '#fde68a' : '#94a3b8'}
        fontSize={viewWidth * 0.018}
        style={{ pointerEvents: 'none' }}
      >
        {boss.name}
      </text>
    </g>
  );
}

function NavigationDot({ marker, viewWidth }: { marker: Marker; viewWidth: number }) {
  // Same floor-removal as BossDot — keep the pin pure-fractional.
  const size = viewWidth * 0.01;
  return (
    <g>
      <circle cx={marker.x} cy={marker.z} r={size * 1.6} fill="rgba(250,204,21,0.22)" />
      <circle cx={marker.x} cy={marker.z} r={size * 0.7} fill="#facc15" stroke="#04100d" strokeWidth={viewWidth * 0.0006} />
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
  // Constant on-screen size regardless of zoom: triangle is always
  // ~3.2% of the visible viewport width (~25 px in a 800px-wide
  // SVG). Player asked specifically: "the triangle should not be
  // scalable, it should be always same size about 20-30dp".
  const size = viewWidth * 0.032;
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
        strokeWidth={viewWidth * 0.0025}
      />
    </g>
  );
}

/**
 * Landmark layer with width-aware label dedup. Sorts mega landmarks
 * first so their labels survive collisions, then walks the rest:
 * each label reserves an approximate bounding box (text width *
 * fontSize) and any later label overlapping that box is suppressed
 * (dot still renders so the player sees the cluster).
 */
function renderLandmarks(viewWidth: number): ReactElement[] {
  const dotSize = viewWidth * 0.012;
  const fontSize = dotSize * 1.6;
  const charWidth = fontSize * 0.55;
  const padding = fontSize * 0.4;
  const sorted = [...WORLD_LANDMARKS].sort((a, b) => Number(b.mega === true) - Number(a.mega === true));
  type LabelBox = { minX: number; maxX: number; minZ: number; maxZ: number };
  const placed: LabelBox[] = [];
  return sorted.map((landmark) => {
    const lx = landmark.position.x + dotSize * 1.8;
    const lz = landmark.position.z;
    const width = landmark.name.length * charWidth;
    const box: LabelBox = {
      minX: lx - padding,
      maxX: lx + width + padding,
      minZ: lz - fontSize * 0.6 - padding,
      maxZ: lz + fontSize * 0.6 + padding,
    };
    const overlaps = placed.some((p) =>
      box.minX < p.maxX && box.maxX > p.minX && box.minZ < p.maxZ && box.maxZ > p.minZ,
    );
    if (!overlaps) placed.push(box);
    return <LandmarkDot key={landmark.id} landmark={landmark} viewWidth={viewWidth} hideLabel={overlaps} />;
  });
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
  return chooseTickSpacingForWidth(bounds.width);
}

function chooseTickSpacingForWidth(width: number): number {
  const target = width / 8;
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

void TICK_SPACING;
