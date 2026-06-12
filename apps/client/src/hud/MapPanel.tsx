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
import { zoneIconPath } from '../../../../packages/content/zoneIcons';
import { WORLD_LANDMARKS, type WorldLandmark } from '../../../../packages/content/worldFeatures';
import type { EnemyEntity, PlayerEntity } from '../gameTypes';
import { listActiveQuestMarkers } from './questMarkers';
import { useDraggablePanel } from './useDraggablePanel';
import { openWikiAt } from './wikiNavBus';
import { renderLandmarks } from './MapLandmarks';

type Marker = { x: number; z: number };

type MapPanelProps = {
  player: PlayerEntity | null;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: Marker | null;
  onSetNavigationMarker?: (marker: Marker | null) => void;
  /** GM map travel — teleport to the dropped pin (server gates by GM). */
  onGmTeleport?: (target: Marker) => void;
  enemies?: Record<string, EnemyEntity>;
};

const VIEW_PADDING = 0.08;
const WORLD_BOUNDS = computeWorldBounds(GAME_ZONES, WORLD_LANDMARKS);
const TICK_SPACING = chooseTickSpacing(WORLD_BOUNDS);
// §52 follow-up — derive zoom limits from real world distances so
// the player can frame anything from "the whole world" to "2 m
// around me".
//   Baseline run speed is 20 units/sec (statContributions.ts).
//   30 s walk = 600 units → 1 200 units diameter view = the
//   default "what's nearby" frame.
//   Close-zoom = 2 m view diameter (you + your immediate ring).
const RUN_SPEED_UPS = 20;
const DEFAULT_VIEW_DIAMETER = 30 * 2 * RUN_SPEED_UPS; // 1200 world units
const MIN_VIEW_DIAMETER = 2;                          // 2 m close-up
const MIN_ZOOM = 1; // whole world fits
const MAX_ZOOM = Math.max(50, WORLD_BOUNDS.width / MIN_VIEW_DIAMETER);
const INITIAL_ZOOM = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, WORLD_BOUNDS.width / DEFAULT_VIEW_DIAMETER));
const DRAG_PIXEL_THRESHOLD = 5;
/** Constant on-screen pixel size targets — convert to world units
 *  via the current `viewWidth / svgWidthPx` ratio so the rendered
 *  px stays the same regardless of zoom. */
const LABEL_PX = 12;
const SMALL_LABEL_PX = 11;
const DOT_PX = 8;

type ViewState = {
  zoom: number;
  centerX: number;
  centerZ: number;
};

export function MapPanel({ player, cameraAngleRef, navigationMarker, onSetNavigationMarker, onGmTeleport, enemies }: MapPanelProps) {
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
  const svgPxSize = useSvgPxSize(svgRef);

  const viewWidth = WORLD_BOUNDS.width / view.zoom;
  const viewHeight = WORLD_BOUNDS.height / view.zoom;
  const viewMinX = view.centerX - viewWidth / 2;
  const viewMinZ = view.centerZ - viewHeight / 2;
  const tickSpacing = chooseTickSpacingForWidth(viewWidth);
  // World units per CSS pixel at the current zoom. The SVG uses
  // `preserveAspectRatio="xMidYMid meet"`, which fits the viewBox
  // inside the element using the SMALLER of the two ratios — so
  // the effective screen-pixels-per-world-unit is the min of
  // width-ratio and height-ratio. Pre-fix we used only width and
  // labels rendered smaller than the intended 12 px whenever the
  // panel was wider than tall (the default).
  const pxPerWorld = Math.min(svgPxSize.w / Math.max(1, viewWidth), svgPxSize.h / Math.max(1, viewHeight));
  const worldPerPx = 1 / Math.max(0.0001, pxPerWorld);

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
        {/* GM travel: jump straight to the pin. Server re-checks GM. */}
        {navigationMarker && player?.isGm && onGmTeleport && (
          <button type="button" onClick={() => onGmTeleport(navigationMarker)}>Teleport</button>
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
          <ZoneShape key={zone.id} zone={zone} viewWidth={viewWidth} worldPerPx={worldPerPx} />
        ))}
        {renderLandmarks(viewWidth, worldPerPx)}
        <BossMarkers enemies={enemies} worldPerPx={worldPerPx} />
        <QuestMarkers player={player} worldPerPx={worldPerPx} onSetNavigationMarker={onSetNavigationMarker} />
        {navigationMarker && <NavigationDot marker={navigationMarker} worldPerPx={worldPerPx} />}
        <PlayerMarker x={px} z={pz} dirX={arrowDir.x} dirZ={arrowDir.z} worldPerPx={worldPerPx} />
      </svg>
      <ol className="map-legend">
        <li><span className="map-legend-dot map-legend-dot--player" />You</li>
        <li><span className="map-legend-dot map-legend-dot--zone" />Zone</li>
        <li><span className="map-legend-dot map-legend-dot--mega" />Mega</li>
        <li><span className="map-legend-dot map-legend-dot--landmark" />Landmark</li>
        <li><span className="map-legend-dot map-legend-dot--pin" />Pin</li>
        <li><span className="map-legend-dot map-legend-dot--quest" />Quest</li>
        <li><span className="map-legend-dot map-legend-dot--boss-alive" />Boss (alive)</li>
        <li><span className="map-legend-dot map-legend-dot--boss-dead" />Boss (slain)</li>
      </ol>
    </section>
  );
}

function useSvgPxSize(svgRef: React.MutableRefObject<SVGSVGElement | null>): { w: number; h: number } {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 500, h: 500 });
  useEffect(() => {
    const node = svgRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect?.width && rect?.height) setSize({ w: rect.width, h: rect.height });
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [svgRef]);
  return size;
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

function ZoneShape({ zone, viewWidth, worldPerPx }: { zone: Zone; viewWidth: number; worldPerPx: number }) {
  // Zone label sized at a constant 13 CSS px regardless of zoom.
  // Suppress the label when the zone footprint is too small to
  // comfortably host the text (label clutter is worse than a bare
  // dot at deep zoom-outs).
  const labelSize = worldPerPx * 13;
  const minViewportRatio = 0.06;
  const zoneFitsLabel = zone.radius * 2 > viewWidth * minViewportRatio;
  // Paint the zone's painterly landscape inside the circle (16:9 PNG
  // clipped to a circular mask + dimmed via opacity), then keep the
  // existing cyan ring on top so the map reads consistently.
  const clipId = `zone-clip-${zone.id}`;
  const imgSize = zone.radius * 2;
  const imgX = zone.position.x - zone.radius;
  const imgY = zone.position.z - zone.radius;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle cx={zone.position.x} cy={zone.position.z} r={zone.radius} />
        </clipPath>
      </defs>
      <image
        href={zoneIconPath(zone.id)}
        x={imgX}
        y={imgY}
        width={imgSize}
        height={imgSize}
        preserveAspectRatio="xMidYMid slice"
        opacity={0.42}
        clipPath={`url(#${clipId})`}
      />
      <circle
        cx={zone.position.x}
        cy={zone.position.z}
        r={zone.radius}
        fill="rgba(141,233,215,0.04)"
        stroke="rgba(141,233,215,0.55)"
        strokeWidth={worldPerPx}
      />
      {zoneFitsLabel && (
        <text
          x={zone.position.x}
          y={zone.position.z + labelSize * 0.4}
          fontSize={labelSize}
          textAnchor="middle"
          fill="#c4f1e2"
          style={{ paintOrder: 'stroke', stroke: 'rgba(2, 6, 12, 0.75)', strokeWidth: worldPerPx * 0.6, strokeLinejoin: 'round' }}
        >
          {zone.name}
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
function BossMarkers({ enemies, worldPerPx }: { enemies?: Record<string, EnemyEntity>; worldPerPx: number }) {
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
        return <BossDot key={boss.id} boss={boss} x={pos.x} z={pos.z} alive={alive} worldPerPx={worldPerPx} />;
      })}
    </>
  );
}

function BossDot({
  boss, x, z, alive, worldPerPx,
}: { boss: MiniBossSpec; x: number; z: number; alive: boolean; worldPerPx: number }) {
  const size = worldPerPx * DOT_PX;
  const labelSize = worldPerPx * LABEL_PX;
  const fill = alive ? '#fbbf24' : '#475569';
  const halo = alive ? 'rgba(251,191,36,0.28)' : 'rgba(71,85,105,0.22)';
  return (
    <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openWikiAt('bosses', boss.id); }}>
      <circle cx={x} cy={z} r={size * 1.8} fill={halo} />
      <circle cx={x} cy={z} r={size * 0.85} fill={fill} stroke="#04100d" strokeWidth={worldPerPx * 0.5} />
      <text
        x={x}
        y={z + size * 2.4}
        textAnchor="middle"
        fill={alive ? '#fde68a' : '#94a3b8'}
        fontSize={labelSize}
        style={{ pointerEvents: 'none' }}
      >
        {boss.name}
      </text>
    </g>
  );
}

/**
 * §49/M2 — quest pins. One pin per active quest at its current
 * stage's resolved marker. Click → drop a navigation marker on that
 * pin (same as the QuestTrackerStrip "Show on map" action) so the
 * player gets a one-click "guide me there" from the map.
 */
function QuestMarkers({
  player,
  worldPerPx,
  onSetNavigationMarker,
}: {
  player: PlayerEntity | null;
  worldPerPx: number;
  onSetNavigationMarker?: (marker: Marker | null) => void;
}) {
  const markers = listActiveQuestMarkers(player);
  if (markers.length === 0) return null;
  const size = worldPerPx * DOT_PX * 0.85;
  const labelSize = worldPerPx * SMALL_LABEL_PX;
  return (
    <>
      {markers.map((m) => (
        <g
          key={m.questId}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            onSetNavigationMarker?.(m.marker);
          }}
        >
          <circle cx={m.marker.x} cy={m.marker.z} r={size * 1.6} fill="rgba(96,165,250,0.22)" />
          <circle
            cx={m.marker.x}
            cy={m.marker.z}
            r={size * 0.7}
            fill="#60a5fa"
            stroke="#04100d"
            strokeWidth={worldPerPx * 0.5}
          />
          <text
            x={m.marker.x}
            y={m.marker.z + size * 2.4}
            textAnchor="middle"
            fill="#bfdbfe"
            fontSize={labelSize}
            style={{ pointerEvents: 'none' }}
          >
            {m.questName}
          </text>
        </g>
      ))}
    </>
  );
}

function NavigationDot({ marker, worldPerPx }: { marker: Marker; worldPerPx: number }) {
  const size = worldPerPx * DOT_PX;
  return (
    <g>
      <circle cx={marker.x} cy={marker.z} r={size * 1.6} fill="rgba(250,204,21,0.22)" />
      <circle cx={marker.x} cy={marker.z} r={size * 0.7} fill="#facc15" stroke="#04100d" strokeWidth={worldPerPx * 0.5} />
    </g>
  );
}

function PlayerMarker({
  x,
  z,
  dirX,
  dirZ,
  worldPerPx,
}: {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  worldPerPx: number;
}) {
  // Constant 24 CSS-pixel arrow, regardless of zoom.
  const size = worldPerPx * 24;
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
        strokeWidth={worldPerPx * 2}
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
