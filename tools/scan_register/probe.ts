// Scores one placement of a scan (or group) against another, with the same checks the
// registration uses. For tuning: see how a known-good placement ranks.
// Run: node_modules/.bin/jiti tools/scan_register/probe.ts fixed.las[,fixed2.las] moving.las yaw_deg tx ty
// yaw and shift are about the moving scan's centroid, in the fixed scan's raw frame.

import { readFileSync } from "node:fs";
import { readLas } from "../../lib/scan/las";
import { buildTarget, coarseSearch, describeHypothesis, evaluateHypothesis, gather, identity4, localOrigin, prepareScan, refineCandidate } from "../../lib/scan/register";

const [fixedArg, movingArg, yawArg, txArg, tyArg] = process.argv.slice(2);
const files = [...fixedArg.split(","), movingArg];
const clouds = files.map(f => readLas(readFileSync(f).buffer.slice(0) as ArrayBuffer, f.split("/").pop()!));
const origin = localOrigin(clouds[0]);
const preps = clouds.map(c => prepareScan(c, origin));
const T = preps.map(() => identity4());
const fixed = preps.map((_, i) => i).slice(0, -1), moving = [preps.length - 1];
const B = gather(preps, T, moving, null);
const cB: [number, number] = [B.cx, B.cy];
const reach = 30, within: [number, number, number, number] = [B.bbox[0] - reach, B.bbox[1] - reach, B.bbox[2] + reach, B.bbox[3] + reach];
const tgt = buildTarget(fixed.map(i => preps[i]), fixed.map(i => T[i]), within);
const given = { yaw: Number(yawArg), tx: Number(txArg), ty: Number(tyArg), score: 0, overlap_m2: 0 };
const A = gather(preps, T, fixed, within);
// Settle the given placement within 4 m and 4.5 degrees on the 10 cm rasters, then ICP and score it.
const cand = refineCandidate(A.feat, B.feat, cB, given, 4, 4.5) ?? given;
console.log(`given ${given.yaw}deg (${given.tx}, ${given.ty}) settled to ${cand.yaw.toFixed(1)}deg (${cand.tx.toFixed(2)}, ${cand.ty.toFixed(2)})`);
const h = evaluateHypothesis(B, tgt, cand, cB, false);
console.log(`${movingArg.split("/").pop()} against ${fixedArg}: ${describeHypothesis(h, cB)}`);
// Local search around the given placement: every coarse peak within 6 degrees and 5 m, refined and scored.
const yaws: number[] = [];
for (let y = given.yaw - 6; y <= given.yaw + 6.01; y += 1) yaws.push(y);
const coarse = coarseSearch(A.feat, B.feat, cB, yaws, 20, 256, 300);
const near = coarse.filter(c => Math.hypot(c.tx - given.tx, c.ty - given.ty) <= 5);
console.log(`local coarse search: ${coarse.length} peaks, ${near.length} within 5 m of the given placement`);
const scored = near.slice(0, 12).map(c => { const r = refineCandidate(A.feat, B.feat, cB, c, 1.5, 1.5) ?? c; return { c, r, h: evaluateHypothesis(B, tgt, r, cB, true) }; }).sort((a, b) => b.h.rank - a.h.rank);
for (const { c, h } of scored) console.log(`  from ${c.yaw.toFixed(1)}deg (${c.tx.toFixed(1)}, ${c.ty.toFixed(1)}) ${c.score.toFixed(3)}: ${describeHypothesis(h, cB)}`);
