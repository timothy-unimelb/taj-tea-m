// Makes the demo site scan the app loads with "Use demo site scan"
// (public/scans/swanston-st-site-scan.las) from the team's real Scaniverse scans.
//
//   node_modules/.bin/jiti data/test/make-demo-scan.ts "scan 1.las" "scan 2.las" ...
//
// The scans are joined with the app's own stitching (lib/scan/stitch.ts), so the
// result is what the app would make from the same uploads. Then every third
// point is kept, which is the thinning the app's measurement does anyway
// (lib/scan/measure.ts reads at most 600,000 points), so the file measures the
// same as the full scans at a third of the size.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { measureScan } from "../../lib/scan/measure";
import { stitchScans } from "../../lib/scan/stitch";

const KEEP_EVERY = 3;
const out = join(__dirname, "..", "..", "public", "scans", "swanston-st-site-scan.las");

(async () => {
  const inputs = process.argv.slice(2);
  if (!inputs.length) throw new Error("Give the LAS scans to join.");
  const stitched = (await stitchScans(inputs.map(path => new File([readFileSync(path)], basename(path))))).file;
  const full = new Uint8Array(await stitched.arrayBuffer()), header = new DataView(full.buffer);
  const offset = header.getUint32(96, true), record = header.getUint16(105, true), count = header.getUint32(107, true);
  const kept = Math.ceil(count / KEEP_EVERY);
  const thin = new Uint8Array(offset + kept * record);
  thin.set(full.subarray(0, offset));
  for (let i = 0, j = 0; i < count; i += KEEP_EVERY, j++) thin.set(full.subarray(offset + i * record, offset + (i + 1) * record), offset + j * record);
  const view = new DataView(thin.buffer);
  view.setUint32(107, kept, true); // number of points
  view.setUint32(111, kept, true); // all of them first returns
  writeFileSync(out, thin);
  const m = await measureScan(new File([thin], basename(out)));
  console.log(`${out}: ${kept} of ${count} points, ${(thin.length / 1e6).toFixed(1)} MB`);
  console.log(`measures as: ${m.length_m} m of street, kerb ${m.kerb_found ? `${m.kerb_height_m} m` : "not found"}, footpath ${m.footpath ? `${m.footpath.min_clear_m} m clear` : "not measured"}, at ${m.location?.lat}, ${m.location?.lon}`);
})();
