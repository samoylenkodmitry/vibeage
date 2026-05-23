import type { ReactElement } from 'react';
import { WORLD_LANDMARKS, type WorldLandmark } from '../../../../packages/content/worldFeatures';

/**
 * Map landmark layer — extracted from MapPanel so the panel stays
 * inside the per-file budget.
 *
 * Two stages:
 *   1. Cluster by SCREEN-SPACE proximity (~40 px). Anywhere zoomed
 *      out enough that multiple landmarks land in the same finger
 *      target gets folded into a single count badge. One readable
 *      chip beats a stack of unreadable text.
 *   2. For singletons, run a per-landmark label-collision dedup —
 *      megas keep their labels first; ordinary names that would
 *      overlap drop to just a dot.
 *
 * All sizing flows through `worldPerPx` so labels stay constant
 * px regardless of map zoom.
 */
const LABEL_PX = 13;
const DOT_PX = 8;
const CLUSTER_PX = 40;

export function renderLandmarks(viewWidth: number, worldPerPx: number): ReactElement[] {
  void viewWidth;
  const dotSize = worldPerPx * DOT_PX;
  const fontSize = worldPerPx * LABEL_PX;
  const clusterRadius = worldPerPx * CLUSTER_PX;
  const charWidth = fontSize * 0.6;
  const padding = fontSize * 0.6;

  type Cluster = { members: WorldLandmark[]; cx: number; cz: number };
  const clusters: Cluster[] = [];
  for (const lm of WORLD_LANDMARKS) {
    const c = clusters.find((cl) => Math.hypot(cl.cx - lm.position.x, cl.cz - lm.position.z) < clusterRadius);
    if (c) {
      c.members.push(lm);
      c.cx = (c.cx * (c.members.length - 1) + lm.position.x) / c.members.length;
      c.cz = (c.cz * (c.members.length - 1) + lm.position.z) / c.members.length;
    } else {
      clusters.push({ members: [lm], cx: lm.position.x, cz: lm.position.z });
    }
  }

  const out: ReactElement[] = [];
  type LabelBox = { minX: number; maxX: number; minZ: number; maxZ: number };
  const placed: LabelBox[] = [];
  const singletons: WorldLandmark[] = [];
  for (const c of clusters) {
    if (c.members.length === 1) { singletons.push(c.members[0]); continue; }
    out.push(
      <ClusterBadge
        key={`cluster-${c.cx.toFixed(0)}-${c.cz.toFixed(0)}`}
        cx={c.cx} cz={c.cz} count={c.members.length} worldPerPx={worldPerPx}
        sampleName={c.members.find((m) => m.mega)?.name ?? c.members[0].name}
      />,
    );
  }
  const sorted = [...singletons].sort((a, b) => Number(b.mega === true) - Number(a.mega === true));
  for (const landmark of sorted) {
    const lx = landmark.position.x + dotSize * 1.8;
    const lz = landmark.position.z;
    const width = landmark.name.length * charWidth;
    const box: LabelBox = {
      minX: lx - padding, maxX: lx + width + padding,
      minZ: lz - fontSize * 0.6 - padding, maxZ: lz + fontSize * 0.6 + padding,
    };
    const overlaps = placed.some((p) => box.minX < p.maxX && box.maxX > p.minX && box.minZ < p.maxZ && box.maxZ > p.minZ);
    if (!overlaps) placed.push(box);
    out.push(<LandmarkDot key={landmark.id} landmark={landmark} worldPerPx={worldPerPx} hideLabel={overlaps} />);
  }
  return out;
}

function LandmarkDot({
  landmark, worldPerPx, hideLabel,
}: { landmark: WorldLandmark; worldPerPx: number; hideLabel: boolean }) {
  const isMega = landmark.mega === true;
  const dotSize = worldPerPx * (isMega ? DOT_PX * 1.4 : DOT_PX);
  const labelSize = worldPerPx * LABEL_PX;
  return (
    <g>
      <circle
        cx={landmark.position.x}
        cy={landmark.position.z}
        r={dotSize}
        fill={isMega ? '#facc15' : '#fde68a'}
        opacity={isMega ? 0.95 : 0.7}
      />
      {!hideLabel && (
        <text
          x={landmark.position.x + dotSize * 1.8}
          y={landmark.position.z}
          fontSize={labelSize}
          fill={isMega ? '#fef3c7' : '#fde68a'}
          dominantBaseline="middle"
        >
          {landmark.name}
        </text>
      )}
    </g>
  );
}

function ClusterBadge({
  cx, cz, count, worldPerPx, sampleName,
}: { cx: number; cz: number; count: number; worldPerPx: number; sampleName: string }) {
  const r = worldPerPx * DOT_PX * 1.5;
  const labelSize = worldPerPx * LABEL_PX;
  return (
    <g>
      <circle cx={cx} cy={cz} r={r * 1.8} fill="rgba(141,233,215,0.18)" />
      <circle cx={cx} cy={cz} r={r} fill="#0e2030" stroke="#7dd3fc" strokeWidth={worldPerPx * 1.2} />
      <text
        x={cx} y={cz + labelSize * 0.35}
        textAnchor="middle" fontSize={labelSize} fill="#bae6fd"
        style={{ pointerEvents: 'none' }}
      >
        {count}
      </text>
      <text
        x={cx + r * 1.6} y={cz}
        fontSize={labelSize} fill="#bae6fd" dominantBaseline="middle"
        style={{ pointerEvents: 'none' }}
      >
        {sampleName} +{count - 1}
      </text>
    </g>
  );
}
