#!/usr/bin/env node
// Procedural painterly world textures — seamless/tileable, written to
// public/textures as JPEG. Pure value-noise synthesis (no network, no GPU):
// the Codex imagegen path is blocked on this account, and the structured
// materials (timber framing, shingles, stone blocks) synthesize better
// procedurally anyway. Deterministic: same seed → same texture.
//
//   node scripts/generate-world-textures.mjs
import sharp from 'sharp';

const SIZE = 512;

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2_246_822_519) >>> 0);
    s = (Math.imul(s ^ (s >>> 13), 3_266_489_917) >>> 0);
    return ((s ^= s >>> 16) >>> 0) / 4_294_967_295;
  };
}

/** Periodic (tileable) value noise on a grid of `cells` per side. */
function makeNoise(seed, cells) {
  const rng = makeRng(seed);
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rng();
  return (u, v) => {
    const x = ((u % 1) + 1) % 1 * cells;
    const y = ((v % 1) + 1) % 1 * cells;
    const x0 = Math.floor(x) % cells, y0 = Math.floor(y) % cells;
    const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1];
    const c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** fbm over tileable octaves. */
function makeFbm(seed, baseCells, octaves) {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(seed + i * 101, baseCells << i));
  return (u, v) => {
    let sum = 0, amp = 1, total = 0;
    for (let i = 0; i < layers.length; i += 1) {
      sum += layers[i](u, v) * amp;
      total += amp;
      amp *= 0.55;
    }
    return sum / total;
  };
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function paint(fn) {
  const data = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = fn(x / SIZE, y / SIZE);
      const o = (y * SIZE + x) * 3;
      data[o] = clamp255(r); data[o + 1] = clamp255(g); data[o + 2] = clamp255(b);
    }
  }
  return data;
}

async function save(name, data) {
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .jpeg({ quality: 88 })
    .toFile(`public/textures/${name}`);
  console.log('wrote', name);
}

// ---- organic grounds -------------------------------------------------------

function forestFloor() {
  const moss = makeFbm(11, 4, 5);
  const litter = makeFbm(47, 16, 3);
  const needles = makeNoise(83, 64);
  return paint((u, v) => {
    const m = moss(u, v);
    let c = mixc([38, 46, 24], [64, 78, 38], m);             // moss bed
    c = mixc(c, [86, 64, 38], Math.pow(litter(u, v), 3) * 0.9); // leaf litter patches
    const streak = needles(u * 1.7 + m * 0.2, v * 0.3);       // fallen-needle streaks
    if (streak > 0.78) c = mixc(c, [104, 82, 44], 0.55);
    return c;
  });
}

function rockGround() {
  const slabs = makeFbm(7, 6, 5);
  const cracks = makeFbm(29, 12, 4);
  const tuft = makeNoise(61, 48);
  return paint((u, v) => {
    const s = slabs(u, v);
    let c = mixc([96, 98, 100], [136, 138, 136], s);          // weathered granite
    const k = cracks(u, v);
    if (k > 0.46 && k < 0.52) c = mixc(c, [52, 54, 56], 0.7); // crack lines
    if (tuft(u, v) > 0.86) c = mixc(c, [88, 106, 58], 0.65);  // alpine grass in crevices
    return c;
  });
}

function ashGround() {
  const ash = makeFbm(17, 5, 5);
  const crack = makeFbm(53, 10, 4);
  return paint((u, v) => {
    let c = mixc([34, 30, 30], [58, 52, 50], ash(u, v));      // dark ash
    const k = crack(u, v);
    if (k > 0.47 && k < 0.53) {
      const heat = 1 - Math.abs(k - 0.5) / 0.03;
      c = mixc(c, [188, 74, 28], heat * 0.8);                 // ember glow in cracks
    }
    return c;
  });
}

function snowGround() {
  const drift = makeFbm(23, 4, 5);
  const sparkle = makeNoise(91, 128);
  return paint((u, v) => {
    const d = drift(u, v);
    let c = mixc([196, 210, 226], [240, 246, 252], d);        // wind-swept drifts
    if (sparkle(u, v) > 0.94) c = [255, 255, 255];            // frost glints
    return c;
  });
}

function dirtGround() {
  const earth = makeFbm(31, 6, 5);
  const pebbles = makeNoise(71, 72);
  return paint((u, v) => {
    let c = mixc([110, 88, 62], [134, 110, 80], earth(u, v)); // packed earth
    const p = pebbles(u, v);
    if (p > 0.88) c = mixc(c, [150, 142, 130], 0.6);          // pebbles
    if (p < 0.07) c = mixc(c, [84, 66, 46], 0.5);             // damp spots
    return c;
  });
}

// ---- structured materials --------------------------------------------------

function timberWall() {
  const plaster = makeFbm(37, 8, 4);
  const grain = makeNoise(13, 96);
  return paint((u, v) => {
    let c = mixc([222, 210, 186], [238, 228, 206], plaster(u, v)); // cream plaster
    // dark beams: border + one vertical/horizontal mid-beam + diagonals
    const bu = Math.min(u, 1 - u), bv = Math.min(v, 1 - v);
    const beam =
      bu < 0.05 || bv < 0.05 ||
      Math.abs(u - 0.5) < 0.035 ||
      Math.abs(v - 0.55) < 0.035 ||
      Math.abs((u - v) % 1) < 0.03;
    if (beam) c = mixc([74, 52, 34], [94, 68, 44], grain(u * 3, v * 3));
    return c;
  });
}

function roofShingles() {
  const tone = makeNoise(43, 24);
  const wear = makeFbm(67, 10, 3);
  const ROWS = 10, COLS = 7;
  return paint((u, v) => {
    const row = Math.floor(v * ROWS);
    const offsetU = u + (row % 2) * (0.5 / COLS);
    const col = Math.floor(offsetU * COLS);
    const fu = offsetU * COLS - col, fv = v * ROWS - row;
    const t = tone((col + 0.5) / COLS, (row + 0.5) / ROWS);
    let c = mixc([148, 74, 50], [186, 104, 64], t);           // clay tone per shingle
    c = mixc(c, [110, 56, 40], Math.pow(fv, 2.2) * 0.8);      // shadow under the row above
    if (fu < 0.06 || fu > 0.94) c = mixc(c, [96, 50, 36], 0.6); // shingle edges
    c = mixc(c, [120, 88, 70], wear(u, v) * 0.25);            // weathering
    return c;
  });
}

function castleStone() {
  const tone = makeNoise(59, 16);
  const moss = makeFbm(19, 6, 4);
  const ROWS = 8, COLS = 5;
  return paint((u, v) => {
    const row = Math.floor(v * ROWS);
    const offsetU = u + (row % 2) * (0.5 / COLS);
    const col = Math.floor(offsetU * COLS);
    const fu = offsetU * COLS - col, fv = v * ROWS - row;
    const t = tone((col + 0.5) / COLS, (row + 0.5) / ROWS);
    let c = mixc([118, 120, 124], [152, 152, 150], t);        // granite blocks
    const mortar = fu < 0.045 || fu > 0.955 || fv < 0.07 || fv > 0.93;
    if (mortar) {
      c = [82, 80, 78];
      const m = moss(u, v);
      if (m > 0.62) c = mixc(c, [74, 96, 52], (m - 0.62) * 2); // moss in mortar lines
    }
    return c;
  });
}

await save('forest_floor_color.jpg', forestFloor());
await save('rock_ground_color.jpg', rockGround());
await save('ash_ground_color.jpg', ashGround());
await save('snow_ground_color.jpg', snowGround());
await save('dirt_ground_color.jpg', dirtGround());
await save('timber_wall_color.jpg', timberWall());
await save('roof_shingles_color.jpg', roofShingles());
await save('castle_stone_color.jpg', castleStone());
console.log('all textures generated');
