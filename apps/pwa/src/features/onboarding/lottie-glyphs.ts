/**
 * Minimal Lottie (bodymovin v5) animations for onboarding, generated in code:
 * a tinted badge scales in and a line glyph draws itself via a trim path.
 * ~600ms per step (18 frames @ 30fps). Deliberately abstract line icons — no
 * mascots or illustrated people, which would undercut the tone.
 */
type Vec = [number, number];

const NAVY: [number, number, number, number] = [0.114, 0.204, 0.38, 1]; // #1d3461
const ICE: [number, number, number, number] = [0.902, 0.949, 0.976, 1]; // #e6f2f9
const FRAMES = 18;
const ease = { o: { x: [0.4], y: [0] }, i: { x: [0.2], y: [1] } };
const staticVal = <T>(k: T) => ({ a: 0, k });
const transform = () => ({ ty: 'tr', p: staticVal([0, 0]), a: staticVal([0, 0]), s: staticVal([100, 100]), r: staticVal(0), o: staticVal(100) });

type Prim =
  | { kind: 'rect'; at: Vec; size: Vec; r: number }
  | { kind: 'ellipse'; at: Vec; size: Vec }
  | { kind: 'path'; points: Vec[]; closed?: boolean };

function shape(p: Prim) {
  if (p.kind === 'rect') return { ty: 'rc', p: staticVal(p.at), s: staticVal(p.size), r: staticVal(p.r) };
  if (p.kind === 'ellipse') return { ty: 'el', p: staticVal(p.at), s: staticVal(p.size) };
  const zeros = p.points.map(() => [0, 0]);
  return { ty: 'sh', ks: staticVal({ c: !!p.closed, v: p.points, i: zeros, o: zeros }) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 10): Vec[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Vec;
  });
}

function animation(name: string, prims: Prim[]) {
  const layer = (ind: number, nm: string, shapes: unknown[], scaleIn: boolean) => ({
    ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, ip: 0, op: FRAMES, st: 0, bm: 0,
    ks: {
      o: staticVal(100), r: staticVal(0), p: staticVal([60, 60, 0]), a: staticVal([0, 0, 0]),
      s: scaleIn ? { a: 1, k: [{ t: 0, s: [82, 82, 100], ...ease }, { t: 10, s: [100, 100, 100] }] } : staticVal([100, 100, 100]),
    },
    shapes,
  });
  return {
    v: '5.7.4', fr: 30, ip: 0, op: FRAMES, w: 120, h: 120, nm: name, ddd: 0, assets: [],
    layers: [
      layer(1, 'glyph', [
        {
          ty: 'gr',
          it: [...prims.map(shape), { ty: 'st', c: staticVal(NAVY), o: staticVal(100), w: staticVal(4), lc: 2, lj: 2 }, transform()],
        },
        { ty: 'tm', s: staticVal(0), e: { a: 1, k: [{ t: 3, s: [0], ...ease }, { t: FRAMES - 1, s: [100] }] }, o: staticVal(0), m: 1 },
      ], false),
      layer(2, 'badge', [{ ty: 'gr', it: [shape({ kind: 'ellipse', at: [0, 0], size: [108, 108] }), { ty: 'fl', c: staticVal(ICE), o: staticVal(100) }, transform()] }], true),
    ],
  };
}

export const ONBOARDING_ANIMATIONS = [
  // 1 — your own way: a speech bubble
  animation('s1', [
    { kind: 'rect', at: [0, -6], size: [58, 40], r: 12 },
    { kind: 'path', points: [[-10, 14], [-18, 26], [2, 14]] },
  ]),
  // 2 — works offline: a phone with a check
  animation('s2', [
    { kind: 'rect', at: [0, 0], size: [38, 62], r: 8 },
    { kind: 'path', points: [[-9, 1], [-2, 8], [10, -6]] },
  ]),
  // 3 — your words stay with you: a lock
  animation('s3', [
    { kind: 'path', points: arc(0, -6, 14, 180, 360) },
    { kind: 'rect', at: [0, 12], size: [46, 34], r: 6 },
  ]),
  // 4 — someone is looking out for you: two people
  animation('s4', [
    { kind: 'ellipse', at: [-14, -12], size: [18, 18] },
    { kind: 'ellipse', at: [16, -12], size: [18, 18] },
    { kind: 'path', points: arc(-14, 18, 15, 180, 360) },
    { kind: 'path', points: arc(16, 18, 15, 180, 360) },
  ]),
  // 5 — help is always here: a lifebuoy
  animation('s5', [
    { kind: 'ellipse', at: [0, 0], size: [62, 62] },
    { kind: 'ellipse', at: [0, 0], size: [26, 26] },
    { kind: 'path', points: [[-22, -22], [-9, -9]] },
    { kind: 'path', points: [[22, -22], [9, -9]] },
    { kind: 'path', points: [[-22, 22], [-9, 9]] },
    { kind: 'path', points: [[22, 22], [9, 9]] },
  ]),
] as const;
