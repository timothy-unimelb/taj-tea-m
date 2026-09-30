// Makes synthetic LiDAR scans (binary PLY, y up, like a phone scan) of the
// west side of Swanston St outside the Sidney Myer Asia Centre, to test scan
// measurement until a real Scaniverse export is available.
// Test data only: shapes and sizes are made up to look like the site.
//
// Cross-section, metres from the building line: footpath 0 to 5 (150 mm above
// the road), kerb at 5, bike track 5.2 to 7.2, raised separator 7.2 to 7.5,
// northbound lane from 7.5 to the scan's reach at 9.5.
//
// Run: node data/test/make-smac-scans.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const noise = () => (rand() - 0.5) * 0.008;

function scan(length, obstacles) {
  const pts = [];
  const push = (x, y, z) => pts.push(x + noise(), y + noise(), z + noise());
  const ground = z => (z < 5 ? 0.15 : z < 5.2 ? 0 : z < 7.2 ? 0 : z < 7.5 ? 0.1 : 0) + z * -0.004; // slight crossfall
  // Ground, 4 cm spacing with jitter. Gaps where obstacles stand are fine.
  for (let x = 0; x < length; x += 0.04) for (let z = 0; z < 9.5; z += 0.04) {
    const zz = z + rand() * 0.04, xx = x + rand() * 0.04;
    push(xx, ground(zz), zz);
  }
  // Kerb face.
  for (let x = 0; x < length; x += 0.03) for (let y = 0; y < 0.15; y += 0.03) push(x, y + ground(5.01) , 5);
  // Building wall along the back of the footpath.
  for (let x = 0; x < length; x += 0.06) for (let y = 0.15; y < 3; y += 0.06) push(x, y, -0.02);
  for (const o of obstacles) {
    const base = ground(o.z0);
    if (o.round) {
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, r = (o.x1 - o.x0) / 2;
      for (let a = 0; a < Math.PI * 2; a += 0.08) for (let y = 0; y < o.h; y += 0.04) push(cx + r * Math.cos(a), base + y, cz + r * Math.sin(a));
    } else {
      for (let x = o.x0; x <= o.x1; x += 0.04) for (let z = o.z0; z <= o.z1; z += 0.04) push(x, base + o.h, z);
      for (let y = 0; y < o.h; y += 0.04) {
        for (let x = o.x0; x <= o.x1; x += 0.04) { push(x, base + y, o.z0); push(x, base + y, o.z1); }
        for (let z = o.z0; z <= o.z1; z += 0.04) { push(o.x0, base + y, z); push(o.x1, base + y, z); }
      }
    }
  }
  return pts;
}

function writePly(name, pts) {
  const n = pts.length / 3;
  const header = `ply\nformat binary_little_endian 1.0\ncomment Barrier Brain synthetic test scan. Not a real scan.\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`;
  const body = Buffer.alloc(n * 12);
  for (let i = 0; i < pts.length; i++) body.writeFloatLE(pts[i], i * 4);
  writeFileSync(join(here, name), Buffer.concat([Buffer.from(header), body]));
  console.log(`wrote ${name}: ${n.toLocaleString()} points, ${(body.length / 1e6).toFixed(1)} MB`);
}

// Outside the SMAC entry: a planter against the wall and a bin leave 1.5 m clear.
writePly("smac-entry-footpath.ply", scan(20, [
  { x0: 3.7, x1: 4.3, z0: 4.2, z1: 4.3, h: 0.9 },            // bike hoop
  { x0: 10, x1: 12.5, z0: 0, z1: 1.8, h: 0.8 },              // planter box
  { x0: 10.8, x1: 11.4, z0: 3.3, z1: 3.9, h: 1.1 },          // rubbish bin
  { x0: 15.5, x1: 16.5, z0: 3.9, z1: 4.9, h: 1.8, round: true }, // tree guard
  { x0: 18.45, x1: 18.55, z0: 4.65, z1: 4.75, h: 2.5, round: true }, // sign pole
]));

// The closure start at Grattan St: a traffic signal pole, otherwise clear.
writePly("grattan-closure-start.ply", scan(15, [
  { x0: 1.9, x1: 2.1, z0: 4.5, z1: 4.7, h: 3.2, round: true },
]));

// A scan that misses the kerb: footpath only, as if the phone never reached the road.
seed = 11;
const footOnly = scan(12, []);
const pts = [];
for (let i = 0; i < footOnly.length; i += 3) if (footOnly[i + 2] < 4.6) pts.push(footOnly[i], footOnly[i + 1], footOnly[i + 2]);
writePly("footpath-only-no-kerb.ply", pts);
