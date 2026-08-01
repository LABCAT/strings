/**
 * Star & spiral pattern anchors for 3D string destinations.
 * Outline silhouettes — easier to read with soft filaments.
 */

const TWO_PI = Math.PI * 2;

export const PATTERN_NAMES = [
  "pentagram",
  "hexagram",
  "starburst",
  "spiral",
  "doubleSpiral",
  "infinity",
];

function lerpPt(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Evenly sample a closed polyline by arc length. */
function sampleLoop(verts, count) {
  const n = verts.length;
  if (n === 0 || count <= 0) return [];
  if (count === 1) return [{ ...verts[0] }];

  const segLens = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-6) {
    return Array.from({ length: count }, () => ({ ...verts[0] }));
  }

  const pts = [];
  for (let i = 0; i < count; i++) {
    let d = (i / count) * total;
    for (let s = 0; s < n; s++) {
      if (d <= segLens[s] || s === n - 1) {
        const t = segLens[s] > 1e-6 ? d / segLens[s] : 0;
        pts.push(lerpPt(verts[s], verts[(s + 1) % n], Math.min(1, t)));
        break;
      }
      d -= segLens[s];
    }
  }
  return pts;
}

function fitCount(pts, count) {
  if (pts.length > count) return pts.slice(0, count);
  while (pts.length < count) {
    const t = pts.length / Math.max(1, count);
    pts.push({ x: Math.cos(t * TWO_PI) * 0.35, y: Math.sin(t * TWO_PI) * 0.35, z: 0 });
  }
  return pts;
}

/** n-point star outline (outer/inner radius alternating). */
function starOutline(tips, count, inner = 0.38, phase = -Math.PI / 2) {
  const verts = [];
  for (let i = 0; i < tips * 2; i++) {
    const a = phase + (i / (tips * 2)) * TWO_PI;
    const r = i % 2 === 0 ? 1 : inner;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
  }
  return sampleLoop(verts, count);
}

function pentagram(count) {
  return starOutline(5, count, 0.38);
}

function hexagram(count) {
  return starOutline(6, count, 0.45);
}

/** Radial rays from center — asterisk / starburst. */
function starburst(count) {
  const rays = 8;
  const perRay = Math.max(2, Math.floor(count / rays));
  const pts = [];
  for (let r = 0; r < rays; r++) {
    const a = -Math.PI / 2 + (r / rays) * TWO_PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let i = 0; i < perRay; i++) {
      const t = (i + 1) / perRay;
      pts.push({ x: c * t, y: s * t, z: 0 });
    }
  }
  return fitCount(pts, count);
}

function spiral(count) {
  const pts = [];
  const turns = 2.4;
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = t * turns * TWO_PI;
    const r = 0.12 + t * 0.88;
    pts.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z: (t - 0.5) * 0.25,
    });
  }
  return pts;
}

/** Two counter-rotating arms (yin / galaxy feel). */
function doubleSpiral(count) {
  const half = Math.floor(count / 2);
  const rest = count - half;
  const arm = (n, phase) => {
    const pts = [];
    const turns = 1.6;
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      const a = phase + t * turns * TWO_PI;
      const r = 0.1 + t * 0.9;
      pts.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        z: (t - 0.5) * 0.2,
      });
    }
    return pts;
  };
  return [...arm(half, 0), ...arm(rest, Math.PI)];
}

/** Lemniscate of Bernoulli (∞). */
function infinity(count) {
  const pts = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TWO_PI;
    const s = Math.sin(t);
    const c = Math.cos(t);
    const denom = 1 + s * s;
    pts.push({
      x: (c / denom) * 1.4,
      y: ((s * c) / denom) * 1.4,
      z: 0,
    });
  }
  return pts;
}

const GENERATORS = {
  pentagram,
  hexagram,
  starburst,
  spiral,
  doubleSpiral,
  infinity,
};

function normalizeExtent(pts) {
  let maxR = 0;
  for (const p of pts) {
    maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  }
  if (maxR < 1e-6) return pts;
  const inv = 1 / maxR;
  return pts.map((p) => ({ x: p.x * inv, y: p.y * inv, z: p.z * inv }));
}

function rotateEuler(pts, ax, ay, az) {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  return pts.map((p) => {
    let { x, y, z } = p;
    const x1 = x * cz - y * sz;
    const y1 = x * sz + y * cz;
    const z1 = z;
    const x2 = x1 * cy + z1 * sy;
    const y2 = y1;
    const z2 = -x1 * sy + z1 * cy;
    return {
      x: x2,
      y: y2 * cx - z2 * sx,
      z: y2 * sx + z2 * cx,
    };
  });
}

/**
 * Build `count` local-space anchors (pattern XY + optional depth).
 * Apply camera billboarding in the sketch so the figure stays face-on.
 */
export function getPatternLocalAnchors(name, count, halo) {
  const gen = GENERATORS[name] || pentagram;
  let pts = gen(count);
  pts = normalizeExtent(pts);
  pts = rotateEuler(pts, 0, 0, halo.spin || 0);

  const scale = halo.scale ?? 1;
  const rx = halo.rx * scale;
  const ry = halo.ry * scale;
  const rz = halo.rz * scale;

  return pts.map((p) => ({
    x: p.x * rx,
    y: p.y * ry,
    z: p.z * rz,
  }));
}

/** Random pattern — never returns `exclude` when alternatives exist. */
export function randomPatternName(exclude = null, rng = Math.random) {
  const options =
    exclude == null
      ? PATTERN_NAMES
      : PATTERN_NAMES.filter((name) => name !== exclude);
  const pool = options.length > 0 ? options : PATTERN_NAMES;
  return pool[Math.floor(rng() * pool.length)];
}
