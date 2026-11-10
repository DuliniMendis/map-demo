/**
 * Draws the landing ("Vision") illustration: a low yellow sun over red-earth ranges, a river winding
 * out of the hills and the dark shapes of river red gums in the foreground. Written to
 * src/app/vision/landscape.svg.
 *
 * The palette echoes the Aboriginal flag the app already uses (black, red ochre, yellow sun) but the
 * drawing is a plain landscape illustration: it deliberately does not imitate Aboriginal art styles
 * (dot painting, cross-hatching, x-ray), which belong to the communities and artists they come from.
 *
 * Everything is generated from a fixed seed, so reruns give the same file:
 *   node scripts/vision-art.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/app/vision/landscape.svg', import.meta.url));
const W = 1200;
const H = 560;
const HORIZON = 300;

// ---- seeded randomness ----

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261110);
const between = (lo: number, hi: number) => lo + (hi - lo) * rnd();
const f = (n: number) => (Math.round(n * 10) / 10).toString();

type Pt = [number, number];

/** Smooth path through points (quadratic curves between midpoints). */
function smooth(points: Pt[], close = false): string {
  if (points.length < 2) return '';
  let d = `M${f(points[0]![0])} ${f(points[0]![1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    d += ` Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const last = points[points.length - 1]!;
  d += ` L${f(last[0])} ${f(last[1])}`;
  return close ? d + ' Z' : d;
}

/** A ridge line across the picture by midpoint displacement, closed down to `bottom`. */
function ridge(
  base: number,
  amp: number,
  rough: number,
  bottom: number,
  shape?: (x: number) => number,
) {
  const n = 64;
  const ys: number[] = new Array(n + 1).fill(0);
  ys[0] = between(-amp, amp);
  ys[n] = between(-amp, amp);
  const subdivide = (lo: number, hi: number, a: number) => {
    if (hi - lo < 2) return;
    const mid = (lo + hi) >> 1;
    ys[mid] = (ys[lo]! + ys[hi]!) / 2 + between(-a, a);
    subdivide(lo, mid, a * rough);
    subdivide(mid, hi, a * rough);
  };
  subdivide(0, n, amp);
  const pts: Pt[] = ys.map((y, i) => {
    const x = (i / n) * (W + 40) - 20;
    return [x, base + y - (shape ? shape(x) : 0)];
  });
  const line = pts;
  const area = smooth([...pts, [W + 20, bottom], [-20, bottom]], true);
  return { line, area };
}

/** Short pencil strokes hanging under a ridge line: the "drawn" shading on the hills. */
function hatch(line: Pt[], depth: number, count: number, slant: number): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const x = between(0, W);
    const j = Math.min(
      line.length - 2,
      Math.max(0, Math.floor(((x + 20) / (W + 40)) * (line.length - 1))),
    );
    const [x0, y0] = line[j]!;
    const [x1, y1] = line[j + 1]!;
    const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    const top = y + between(4, depth * 0.6);
    const len = between(depth * 0.15, depth * 0.45);
    d += `M${f(x)} ${f(top)}l${f(slant * len)} ${f(len)}`;
  }
  return d;
}

// ---- gum trees ----

interface Branch {
  d: string;
  w: number;
}

/** A river red gum: a leaning, twisting trunk splitting into crooked limbs, foliage in loose clumps. */
function gum(x: number, y: number, size: number, lean: number) {
  const branches: Branch[] = [];
  const clumps: string[] = [];
  const grow = (
    sx: number,
    sy: number,
    angle: number,
    len: number,
    width: number,
    depth: number,
  ) => {
    const pts: Pt[] = [[sx, sy]];
    let cx = sx;
    let cy = sy;
    let a = angle;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      a += between(-0.28, 0.28);
      cx += Math.cos(a) * (len / segs);
      cy += Math.sin(a) * (len / segs);
      pts.push([cx, cy]);
    }
    branches.push({ d: smooth(pts), w: width });
    if (depth === 0 || width < 1.2) {
      clump(cx, cy, len * between(0.7, 1.1));
      return;
    }
    const kids = depth > 2 ? 2 : rnd() < 0.7 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const spread = between(0.35, 0.75) * (k % 2 === 0 ? -1 : 1);
      grow(cx, cy, a + spread, len * between(0.62, 0.8), width * between(0.55, 0.7), depth - 1);
    }
    if (depth <= 2 && rnd() < 0.5) clump(cx, cy, len * 0.6);
  };
  const clump = (cx: number, cy: number, r: number) => {
    // A ragged canopy blob: a ring of jittered points, slightly flattened like eucalypt foliage.
    const n = 14;
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const rr = r * between(0.65, 1.05);
      pts.push([cx + Math.cos(t) * rr * 1.25, cy + Math.sin(t) * rr * 0.7 - r * 0.15]);
    }
    pts.push(pts[0]!);
    clumps.push(smooth(pts, true));
  };
  grow(x, y, -Math.PI / 2 + lean, size * 0.42, size * 0.075, 4);
  return { branches, clumps };
}

function drawGum(
  x: number,
  y: number,
  size: number,
  lean: number,
  fill: string,
  opacity = 1,
): string {
  const { branches, clumps } = gum(x, y, size, lean);
  // Trunk flare at the base.
  const bw = size * 0.075;
  const base = `M${f(x - bw * 1.6)} ${f(y + 2)} Q${f(x - bw * 0.4)} ${f(y - size * 0.05)} ${f(x - bw * 0.4)} ${f(y - size * 0.12)} L${f(x + bw * 0.4)} ${f(y - size * 0.12)} Q${f(x + bw * 0.5)} ${f(y - size * 0.05)} ${f(x + bw * 1.8)} ${f(y + 2)} Z`;
  return [
    `<g opacity="${opacity}">`,
    `<path d="${base}" fill="${fill}"/>`,
    ...branches.map(
      (b) =>
        `<path d="${b.d}" fill="none" stroke="${fill}" stroke-width="${f(b.w)}" stroke-linecap="round"/>`,
    ),
    `<path d="${clumps.join(' ')}" fill="${fill}"/>`,
    `</g>`,
  ].join('');
}

/** A tiny distant tree: a stalk and a soft round top. */
function farTree(x: number, y: number, s: number, fill: string): string {
  return `<path d="M${f(x)} ${f(y)}v${f(-s * 0.6)}" stroke="${fill}" stroke-width="${f(s * 0.12)}"/><ellipse cx="${f(x)}" cy="${f(y - s * 0.8)}" rx="${f(s * 0.55)}" ry="${f(s * 0.38)}" fill="${fill}"/>`;
}

/** A spinifex / tussock clump: a fan of grass blades. */
function tuft(x: number, y: number, s: number): string {
  let d = '';
  const blades = 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < blades; i++) {
    const a = -Math.PI / 2 + between(-1.15, 1.15);
    const len = s * between(0.6, 1.1);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const cx = x + Math.cos(a) * len * 0.4 + between(-2, 2);
    const cy = y + Math.sin(a) * len * 0.6;
    d += `M${f(x + between(-s * 0.15, s * 0.15))} ${f(y)}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`;
  }
  return d;
}

// ---- composition ----

const parts: string[] = [];

// Sky, sun and haze (the sky sits outside the hand-drawn wobble so the picture's edges stay clean).
parts.push(`<circle cx="790" cy="236" r="190" fill="url(#halo)"/>`);
parts.push(`<circle cx="790" cy="236" r="66" fill="#ffc72c"/>`);
parts.push(
  `<circle cx="790" cy="236" r="66" fill="none" stroke="#f0a91c" stroke-width="2" stroke-dasharray="3 7" opacity="0.6"/>`,
);

// Thin drawn clouds.
for (const [cx, cy, w] of [
  [260, 92, 220],
  [980, 70, 170],
  [600, 132, 140],
] as const) {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const y = cy + i * 7 + between(-1.5, 1.5);
    const x0 = cx - w / 2 + between(0, w * 0.2) + i * 14;
    const x1 = cx + w / 2 - between(0, w * 0.25) - i * 10;
    d += `M${f(x0)} ${f(y)}Q${f((x0 + x1) / 2)} ${f(y - 4)} ${f(x1)} ${f(y)}`;
  }
  parts.push(
    `<path d="${d}" fill="none" stroke="#fff6e0" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>`,
  );
}

// Birds — a loose flock of cockatoos heading for the river.
{
  let d = '';
  const flock: Pt[] = [
    [430, 150],
    [462, 132],
    [488, 160],
    [520, 140],
    [548, 118],
    [575, 152],
    [402, 172],
  ];
  for (const [bx, by] of flock) {
    const s = between(7, 11);
    d += `M${f(bx - s)} ${f(by)}q${f(s * 0.5)} ${f(-s * 0.6)} ${f(s)} 0q${f(s * 0.5)} ${f(-s * 0.6)} ${f(s)} 0`;
  }
  parts.push(
    `<path d="${d}" fill="none" stroke="#2a1d17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

// Far ranges (hazy mauve), mid ranges with a flat-topped escarpment (ochre), near red-earth rise.
const far = ridge(HORIZON - 40, 26, 0.55, H + 40, (x) => 22 * Math.exp(-(((x - 300) / 180) ** 2)));
parts.push(`<path d="${far.area}" fill="url(#far)"/>`);
parts.push(
  `<path d="${hatch(far.line, 70, 120, -0.5)}" stroke="#8f6a78" stroke-width="1.1" opacity="0.35" fill="none"/>`,
);

const mesa = (x: number) => {
  // A flat-topped escarpment left of centre, steep faces either side.
  const top = 70;
  const l = 120;
  const r = 470;
  if (x < l - 60 || x > r + 70) return 0;
  if (x < l) return top * ((x - (l - 60)) / 60) ** 1.6;
  if (x > r) return top * (1 - (x - r) / 70) ** 1.6;
  return top + Math.sin(x / 23) * 1.5;
};
const mid = ridge(HORIZON + 8, 12, 0.5, H + 40, mesa);
parts.push(`<path d="${mid.area}" fill="url(#mid)"/>`);
parts.push(
  `<path d="${hatch(mid.line, 90, 220, 0.35)}" stroke="#7a2a1a" stroke-width="1.2" opacity="0.32" fill="none"/>`,
);
// Strata lines on the escarpment face.
{
  let d = '';
  for (let i = 0; i < 6; i++) {
    const y = HORIZON - 52 + i * 9 + between(-1, 1);
    d += `M${f(128 + i * 3)} ${f(y)}Q300 ${f(y + between(-3, 3))} ${f(462 - i * 4)} ${f(y + 1)}`;
  }
  parts.push(
    `<path d="${d}" stroke="#8a3420" stroke-width="1.3" opacity="0.4" fill="none" stroke-linecap="round"/>`,
  );
}

// Distant line of trees along the river flats.
{
  let s = '';
  for (let i = 0; i < 26; i++) {
    const x = between(520, 1180);
    s += farTree(x, HORIZON + 22 + between(-3, 4), between(7, 13), '#5b2a1c');
  }
  parts.push(`<g opacity="0.75">${s}</g>`);
}

const near = ridge(HORIZON + 56, 10, 0.5, H + 40, (x) => 18 * Math.sin((x / W) * Math.PI));
parts.push(`<path d="${near.area}" fill="url(#earth)"/>`);

// The river: a ribbon from the gap below the escarpment, widening as it comes towards us.
{
  const centre: Pt[] = [];
  const widths: number[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = HORIZON + 30 + t * (H - HORIZON + 20);
    const x = 560 + Math.sin(t * 3.4 + 0.4) * (60 + 160 * t) - 120 * t;
    centre.push([x, y]);
    widths.push(4 + 190 * t ** 1.7);
  }
  const left = centre.map(([x, y], i): Pt => [x - widths[i]! / 2, y]);
  const right = centre.map(([x, y], i): Pt => [x + widths[i]! / 2, y]).reverse();
  parts.push(`<path d="${smooth([...left, ...right], true)}" fill="url(#water)"/>`);
  // Sun glints and ripples.
  let d = '';
  for (let i = 4; i < steps; i += 1) {
    const [x, y] = centre[i]!;
    const w = widths[i]!;
    const n = 1 + Math.floor(w / 60);
    for (let k = 0; k < n; k++) {
      const rx = x + between(-w * 0.35, w * 0.3);
      const len = between(w * 0.08, w * 0.22);
      d += `M${f(rx)} ${f(y + between(-2, 2))}h${f(len)}`;
    }
  }
  parts.push(
    `<path d="${d}" stroke="#fff3c4" stroke-width="1.6" stroke-linecap="round" opacity="0.75" fill="none"/>`,
  );
  // Sandy banks.
  parts.push(
    `<path d="${smooth(left)}" fill="none" stroke="#f3c98b" stroke-width="3" opacity="0.7" stroke-linecap="round"/>`,
    `<path d="${smooth(right.slice().reverse())}" fill="none" stroke="#f3c98b" stroke-width="3" opacity="0.7" stroke-linecap="round"/>`,
  );
}

// Ground texture: tussocks and spinifex, bigger towards the front, kept off the river.
{
  let d = '';
  for (let i = 0; i < 150; i++) {
    const y = between(HORIZON + 60, H + 6);
    const t = (y - HORIZON - 30) / (H - HORIZON - 10);
    const riverX = 560 + Math.sin(t * 3.4 + 0.4) * (60 + 160 * t) - 120 * t;
    const half = (4 + 190 * Math.max(0, t) ** 1.7) / 2 + 14;
    const x = between(-10, W + 10);
    if (Math.abs(x - riverX) < half) continue;
    d += tuft(x, y, 6 + 30 * t ** 1.4);
  }
  parts.push(
    `<path d="${d}" fill="none" stroke="#5c2c14" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>`,
  );
  // Pebbles / dry ground speckle.
  let s = '';
  for (let i = 0; i < 160; i++) {
    const y = between(HORIZON + 70, H);
    const x = between(0, W);
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(between(1, 3))}" ry="${f(between(0.6, 1.5))}"/>`;
  }
  parts.push(`<g fill="#7d3317" opacity="0.35">${s}</g>`);
}

// Foreground river red gums: one big tree right, a smaller one on the left bank.
parts.push(drawGum(140, H - 34, 330, -0.18, '#1d1411', 0.92));
parts.push(drawGum(1030, H - 10, 520, 0.12, '#140e0c'));
parts.push(drawGum(1170, H - 60, 260, -0.3, '#1d1411', 0.9));

const defs = `
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f6dcb0"/>
    <stop offset="0.38" stop-color="#fbe7c2"/>
    <stop offset="0.56" stop-color="#ffd38a"/>
    <stop offset="1" stop-color="#f4a25a"/>
  </linearGradient>
  <radialGradient id="halo">
    <stop offset="0" stop-color="#fff1b8" stop-opacity="0.95"/>
    <stop offset="0.45" stop-color="#ffd76b" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#ffc72c" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c58f8a"/>
    <stop offset="0.25" stop-color="#d9a68f"/>
  </linearGradient>
  <linearGradient id="mid" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c9532f"/>
    <stop offset="0.22" stop-color="#b2402a"/>
  </linearGradient>
  <linearGradient id="earth" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#d9622f"/>
    <stop offset="0.5" stop-color="#c4492a"/>
    <stop offset="1" stop-color="#9c3220"/>
  </linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe2a0"/>
    <stop offset="0.35" stop-color="#9cc3cc"/>
    <stop offset="1" stop-color="#4e8ea0"/>
  </linearGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>
    <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.08  0 0 0 1.4 -0.45"/>
  </filter>
  <filter id="wobble" x="-2%" y="-2%" width="104%" height="104%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5"/>
  </filter>
</defs>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<!-- Generated by scripts/vision-art.ts — edit the script, not this file. -->${defs}
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g filter="url(#wobble)">${parts.join('\n')}</g>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.18"/>
</svg>
`;

writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${(svg.length / 1024).toFixed(1)} kB)`);
