// Draws a test traffic guidance scheme (TGS) for Swanston St opposite the
// Sidney Myer Asia Centre, between Grattan St and Faraday St, Parkville,
// in the same layout as the sample TGS in data/mock/tgs/: aerial photo,
// yellow sign callouts, VMS panels, detour inset, legend, title block.
// Aerial: Vicmap Basemap (Victorian Government, CC BY 4.0), fetched at run time.
// Street positions: OpenStreetMap (ODbL). The Swanston St tram line is the
// road's centre. The work zone is the southbound kerbside lane on the east
// side, 22 to 60 m north of Grattan St, where the team's site scan was taken.
// Test data only. Not a real plan and not for use on site.
//
// Run: node data/test/make-smac-tgs.mjs  (writes swanston-smac-lane-closure.jpg)

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const W = 2400, H = 1700;

// ---------- Aerial ----------
const Z = 19, N = 2 ** Z, TX0 = 473260, TY0 = 321682, TILES = 6, MPP = 0.2359; // metres per aerial pixel
const tilePx = (lat, lon) => [((lon + 180) / 360 * N - TX0) * 256, ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * N - TY0) * 256];
const tiles = [];
for (let x = 0; x < TILES; x++) for (let y = 0; y < TILES; y++) {
  const r = await fetch(`https://base.maps.vic.gov.au/wmts/AERIAL_WM_256/EPSG:3857:256/${Z}/${TX0 + x}/${TY0 + y}.png`);
  if (!r.ok) throw new Error(`Vicmap tile ${x},${y}: ${r.status}`);
  tiles.push({ input: Buffer.from(await r.arrayBuffer()), left: x * 256, top: y * 256 });
}
const aerial = await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "#888" } }).composite(tiles).png().toBuffer();

// Map frame on the sheet, and the part of the aerial it shows.
const MAP = { x: 20, y: 110, w: 1560, h: 1110 };
// From just south of Faraday St to about 30 m south of Grattan St.
const CROP = { x: 0, y: 260, w: 1536, h: Math.round(1536 * MAP.h / MAP.w) };
const K = MAP.w / CROP.w; // sheet px per aerial px
const sheet = ([ax, ay]) => [MAP.x + (ax - CROP.x) * K, MAP.y + (ay - CROP.y) * K];
const geo = (lat, lon) => sheet(tilePx(lat, lon));

// Street axis: the Swanston St tram line, heading north. `off` is metres west of it.
const A = tilePx(-37.807397, 144.962843), B = tilePx(-37.799206, 144.964240);
const len = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len;
const wx = uy, wy = -ux; // west-pointing normal in image coordinates
const G0 = tilePx(-37.80017, 144.96399); // Grattan St north kerb on the axis
const along0 = ((G0[0] - B[0]) * ux + (G0[1] - B[1]) * uy);
const S = (along, off) => sheet([B[0] + ux * (along0 + along / MPP) + wx * off / MPP, B[1] + uy * (along0 + along / MPP) + wy * off / MPP]);
const ANGLE = Math.atan2(uy, ux) * 180 / Math.PI; // direction of travel north, in sheet degrees

// Cross-section, metres west of the tram line (negative is east).
const SB = [-6.8, -3.5], NBL = 5, BIKE = -8.1, FOOT = -12.3;
// Southbound traffic meets the taper at the north end and the closure runs to Grattan St.
const CLOSE = [2, 86], WORK = [22, 60];

const out = [];
const add = s => out.push(s);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (x, y, s, size = 14, extra = "") => add(`<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" ${extra}>${esc(s)}</text>`);
const poly = (pts, fill, extra = "") => add(`<polygon points="${pts.map(p => p.join(",")).join(" ")}" fill="${fill}" ${extra}/>`);
const band = (a0, a1, o0, o1, fill, extra = "") => poly([S(a0, o0), S(a1, o0), S(a1, o1), S(a0, o1)], fill, extra);
const pline = (pts, stroke, w, extra = "") => add(`<polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`);
const along = (a0, a1, off) => [S(a0, off), S(a1, off)];

add(`<defs>
<marker id="arB" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1450d2"/></marker>
<marker id="arC" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#18c6e6"/></marker>
<marker id="arP" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8a2be2"/></marker>
<marker id="arK" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#000"/></marker>
<marker id="arR" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#d11"/></marker>
<clipPath id="map"><rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}"/></clipPath>
</defs>`);
add(`<rect width="${W}" height="${H}" fill="#fff"/>`);

// ---------- Plan overlays on the aerial ----------
add(`<g clip-path="url(#map)">`);
band(CLOSE[0], CLOSE[1], SB[0], SB[1], "#fff27a", `opacity="0.7"`);
band(WORK[0], WORK[1], SB[0], SB[1], "#6fe06f", `opacity="0.85"`);
// Water-filled barriers: tram side of the closure, and bike-lane side of the work area.
pline(along(CLOSE[0] + 2, CLOSE[1] - 12, SB[1] - 0.15), "#e11", 4);
pline(along(WORK[0], WORK[1], SB[0] + 0.15), "#e11", 4);
// Merge taper at the north end, bollards at 4 m.
for (let i = 0; i <= 3; i++) { const [x, y] = S(CLOSE[1] - i * 4, SB[0] + 0.3 + i * 1.0); add(`<circle cx="${x}" cy="${y}" r="4" fill="#f28c00" stroke="#000" stroke-width="0.8"/>`); }
// Movements: southbound traffic turns left into Faraday St; northbound, bikes and pedestrians carry on.
pline([S(235, -5.2), S(196, -5.2), geo(-37.79846, 144.96520)], "#1450d2", 3, `marker-end="url(#arB)"`);
pline(along(-40, 230, NBL), "#1450d2", 3, `marker-end="url(#arB)"`);
pline(along(230, -40, BIKE), "#8a2be2", 2.5, `marker-end="url(#arP)"`);
pline(along(230, -40, FOOT), "#18c6e6", 2.5, `stroke-dasharray="10 6" marker-end="url(#arC)"`);
add(`</g>`);

// Traffic controllers and VMS boards.
function tc(p, label) {
  const [x, y] = p;
  add(`<circle cx="${x}" cy="${y - 11}" r="4" fill="#000"/><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 4}" stroke="#000" stroke-width="3"/><line x1="${x - 5}" y1="${y + 12}" x2="${x}" y2="${y + 4}" stroke="#000" stroke-width="2.5"/><line x1="${x + 5}" y1="${y + 12}" x2="${x}" y2="${y + 4}" stroke="#000" stroke-width="2.5"/><line x1="${x}" y1="${y - 4}" x2="${x + 8}" y2="${y - 12}" stroke="#000" stroke-width="2"/><circle cx="${x + 10}" cy="${y - 15}" r="4" fill="#ffe600" stroke="#000"/>`);
  text(x + 12, y + 6, label, 12, `font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke"`);
}
function vmsIcon(p) { const [x, y] = p; add(`<rect x="${x - 10}" y="${y - 8}" width="20" height="12" fill="#111" stroke="#ffe600" stroke-width="2"/><line x1="${x}" y1="${y + 4}" x2="${x}" y2="${y + 12}" stroke="#555" stroke-width="3"/><rect x="${x - 8}" y="${y + 12}" width="16" height="5" fill="#f2c300"/>`); }
tc(S(CLOSE[1] + 3, -6.5), "TC 1");
tc(S(40, -10.2), "TC 2");
const VMS1 = S(182, -11.5), VMS2 = S(130, -11.5);
vmsIcon(VMS1); vmsIcon(VMS2);

// Sign callouts: yellow panels with a leader line, as on the sample TGS.
function sign(x, y, lines, to, opts = {}) {
  const w = opts.w ?? 150, lh = opts.lh ?? 16, h = lines.length * lh + 12;
  if (to) add(`<line x1="${x + w / 2}" y1="${to[1] < y ? y : y + h}" x2="${to[0]}" y2="${to[1]}" stroke="#000" stroke-width="1.4" marker-end="url(#arK)"/>`);
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.fill ?? "#ffe600"}" stroke="#000" stroke-width="1.5"/>`);
  lines.forEach((l, i) => text(x + w / 2, y + 20 + i * lh, l, opts.size ?? 12, `text-anchor="middle" font-weight="bold" fill="${opts.color ?? "#000"}"`));
}
// VMS boards show two panels, like the sample.
function vms(x, y, label, p1, p2, to) {
  add(`<line x1="${x + 110}" y1="${y + 62}" x2="${to[0]}" y2="${to[1]}" stroke="#000" stroke-width="1.4" marker-end="url(#arK)"/>`);
  text(x + 4, y - 4, "PANEL 1", 10); text(x + 116, y - 4, "PANEL 2", 10);
  for (const [i, lines] of [p1, p2].entries()) {
    add(`<rect x="${x + i * 112}" y="${y}" width="108" height="62" fill="#fff" stroke="#000" stroke-width="1.5"/>`);
    lines.forEach((l, j) => text(x + i * 112 + 54, y + 18 + j * 14, l, 10.5, `text-anchor="middle" font-weight="bold"`));
  }
  text(x + 170, y + 78, label, 13, `font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke"`);
}
vms(1320, 150, "VMS 1", ["SWANSTON ST", "STH CLOSED", "AT FARADAY"], ["DETOUR VIA", "FARADAY ST"], VMS1);
vms(1320, 300, "VMS 2", ["SWANSTON ST", "STH CLOSED"], ["USE", "CARDIGAN ST"], VMS2);
const at = (a, o) => S(a, o);
sign(1350, 430, ["ROAD WORK", "AHEAD"], at(170, -11), { w: 110, fill: "#f28c00" });
sign(1250, 520, ["SOUTHBOUND", "CLOSED", "← DETOUR"], at(98, -11), { w: 120 });
sign(1280, 760, ["FOOTPATH OPEN", "KEEP 1.5 m CLEAR"], at(45, -12.5), { w: 150 });
sign(1280, 850, ["BIKE LANE OPEN", "KEEP LEFT OF", "BARRIERS"], at(30, BIKE), { w: 140 });
sign(1180, 1000, ["END", "ROAD WORK"], at(-12, -11.5), { w: 110, fill: "#f28c00" });
sign(1100, 240, ["DETOUR →", "FARADAY ST"], geo(-37.79846, 144.96490), { w: 120 });
sign(200, 880, ["DETOUR ←", "GRATTAN ST TO", "SWANSTON ST"], geo(-37.80035, 144.96360), { w: 130 });

// Notes on the plan.
function note(x, y, w, lines, to) {
  const h = lines.length * 17 + 30;
  if (to) add(`<line x1="${x}" y1="${y + h / 2}" x2="${to[0]}" y2="${to[1]}" stroke="#000" stroke-width="1.4" marker-end="url(#arK)"/>`);
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffe600" stroke="#000" stroke-width="1.2"/>`);
  text(x + 8, y + 18, "NOTE:", 13, `font-weight="bold"`);
  lines.forEach((l, i) => text(x + 8, y + 36 + i * 17, l, 12.5, `font-weight="bold"`));
}
note(160, 470, 380, ["WORKS WITHIN 20 m OF TRAM TRACKS.", "YARRA TRAMS APPROVAL REQUIRED.", "BARRIERS 0.8 m CLEAR OF TRAM ENVELOPE."], at(50, SB[1]));
note(160, 640, 380, ["TC 1 AND TC 2 HOLD PEDESTRIANS AND", "CYCLISTS WHILE PLANT CROSSES", "THE BIKE LANE."], at(40, -10.2));
note(700, 1110, 440, ["NORTHBOUND LANE AND TRAMS UNAFFECTED.", "NO RIGHT TURN FROM GRATTAN ST INTO SWANSTON ST NORTH."]);

// Dimension lines, red, as on the sample.
function dim(a0, a1, off, label) {
  const [p, q] = along(a0, a1, off);
  add(`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#d11" stroke-width="1.6" marker-start="url(#arR)" marker-end="url(#arR)"/>`);
  const [mx, my] = S((a0 + a1) / 2, off);
  add(`<text transform="translate(${mx - 8},${my}) rotate(${ANGLE})" text-anchor="middle" font-family="Arial" font-size="13" font-weight="bold" fill="#d11" stroke="#fff" stroke-width="3" paint-order="stroke">${label}</text>`);
}
dim(0, WORK[0], -17, "22.0 m");
dim(WORK[0], WORK[1], -17, "38.0 m");
dim(CLOSE[0], CLOSE[1], -22, "LANE CLOSURE 84 m");

// Street names along the streets.
function streetName(p, rot, label, size = 14) { add(`<text transform="translate(${p[0]},${p[1]}) rotate(${rot})" text-anchor="middle" font-family="Arial" font-size="${size}" font-weight="bold" fill="#000"><tspan style="paint-order:stroke" stroke="#fff" stroke-width="4">${label}</tspan></text>`); }
streetName(S(120, -1), ANGLE, "SWANSTON STREET");
streetName(S(170, -1), ANGLE, "SWANSTON STREET");
streetName(geo(-37.80045, 144.96330), 5, "GRATTAN STREET");
streetName(geo(-37.79838, 144.96520), 5, "FARADAY STREET");
streetName(geo(-37.79836, 144.96345), 5, "MONASH ROAD", 12);
streetName(geo(-37.79915, 144.96330), 0, "SIDNEY MYER ASIA CENTRE (OPPOSITE)", 13);

// Detour inset, top centre, like the sample's street directory inset.
const ix = 560, iy = 20, iw = 560, ih = 170;
add(`<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#fdf7e3" stroke="#000" stroke-width="2"/>`);
const grid = [[ix + 40, iy + 130, ix + 520, iy + 130], [ix + 40, iy + 55, ix + 520, iy + 55], [ix + 150, iy + 15, ix + 150, iy + 160], [ix + 440, iy + 15, ix + 440, iy + 160]];
for (const [a, b, c, d] of grid) add(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#e39a2b" stroke-width="12"/>`);
text(ix + 50, iy + 123, "SWANSTON ST", 12, `font-weight="bold"`);
text(ix + 50, iy + 48, "CARDIGAN ST", 12, `font-weight="bold"`);
text(ix + 156, iy + 158, "GRATTAN ST", 12, `font-weight="bold"`);
text(ix + 446, iy + 158, "FARADAY ST", 12, `font-weight="bold"`);
add(`<polyline points="${ix + 510},${iy + 130} ${ix + 440},${iy + 130} ${ix + 440},${iy + 55} ${ix + 150},${iy + 55} ${ix + 150},${iy + 130} ${ix + 70},${iy + 130}" fill="none" stroke="#1450d2" stroke-width="4" marker-end="url(#arB)"/>`);
add(`<line x1="${ix + 160}" y1="${iy + 130}" x2="${ix + 430}" y2="${iy + 130}" stroke="#e11" stroke-width="5" stroke-dasharray="10 6"/>`);
sign(ix + 340, iy + 72, ["DETOUR ↑"], null, { w: 90, lh: 14 });
sign(ix + 170, iy + 90, ["END DETOUR"], null, { w: 100, lh: 14 });
text(ix + 60, iy + 100, "N →", 14, `font-weight="bold"`);
text(ix + 240, iy + 30, "Mon to Fri 9:30am to 3:30pm", 20, `font-weight="bold" fill="#c00"`);

// Map frame and header.
add(`<rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}" fill="none" stroke="#000" stroke-width="2"/>`);
add(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#000" stroke-width="3"/>`);
text(W - 40, 50, "BARRIER BRAIN TEST DATA", 16, `text-anchor="end"`);

// ---------- Legend panel ----------
const lx = 1600, ly = 70, lw = 770;
add(`<rect x="${lx}" y="${ly}" width="${lw}" height="230" fill="#fff" stroke="#000" stroke-width="2"/>`);
text(lx + 10, ly + 24, "CONTRACTOR:", 16);
add(`<rect x="${lx}" y="${ly + 240}" width="${lw}" height="690" fill="#fff" stroke="#000" stroke-width="2"/>`);
text(lx + lw / 2, ly + 290, "LEGEND", 30, `text-anchor="middle"`);
const legend = [
  ["STORAGE AREA", (x, y) => add(`<line x1="${x}" y1="${y}" x2="${x + 70}" y2="${y}" stroke="#e11" stroke-width="3" stroke-dasharray="10 6"/>`)],
  ["TRAFFIC MOVEMENT", (x, y) => add(`<line x1="${x}" y1="${y}" x2="${x + 66}" y2="${y}" stroke="#1450d2" stroke-width="3" marker-end="url(#arB)"/>`)],
  ["CYCLIST MOVEMENT", (x, y) => add(`<line x1="${x}" y1="${y}" x2="${x + 66}" y2="${y}" stroke="#8a2be2" stroke-width="3" marker-end="url(#arP)"/>`)],
  ["PEDESTRIAN ROUTE", (x, y) => add(`<line x1="${x}" y1="${y}" x2="${x + 66}" y2="${y}" stroke="#18c6e6" stroke-width="3" marker-end="url(#arC)"/>`)],
  ["BOLLARDS / CONES", (x, y) => { for (let i = 0; i < 3; i++) add(`<circle cx="${x + 8 + i * 27}" cy="${y}" r="5" fill="#f28c00" stroke="#000"/>`); }],
  ["WORK AREA", (x, y) => add(`<rect x="${x}" y="${y - 9}" width="70" height="18" fill="#6fe06f"/>`)],
  ["LANE CLOSURE", (x, y) => add(`<rect x="${x}" y="${y - 9}" width="70" height="18" fill="#fff27a"/>`)],
  ["WATER FILLED BARRIERS", (x, y) => add(`<line x1="${x}" y1="${y}" x2="${x + 70}" y2="${y}" stroke="#e11" stroke-width="4"/>`)],
  ["CLASS A VMS", (x, y) => vmsIcon([x + 35, y - 4])],
  ["TRAFFIC CONTROLLER", (x, y) => tc([x + 30, y + 4], "")],
];
legend.forEach(([label, draw], i) => { const y = ly + 340 + i * 57; text(lx + 16, y + 5, label, 17); draw(lx + lw - 110, y); });
// Notes: bollard spacing table, as on the sample.
const ny0 = ly + 940;
add(`<rect x="${lx}" y="${ny0}" width="${lw}" height="${1290 - ny0}" fill="#fff" stroke="#000" stroke-width="2"/>`);
text(lx + 10, ny0 + 26, "NOTES:", 20);
const cols = [lx, lx + 300, lx + 460, lx + 615, lx + lw];
const rows = [["BOLLARD SPACING TABLE", "< than 50KPH", "51 - 70KPH", "> than 70KPH"], ["MERGE TAPER", "4m", "9m", "12m"], ["LATERAL SHIFT TAPER", "4m", "12m", "18m"], ["BOLLARDS ADJACENT CLOSED TAPER", "4m", "18m", "24m"], ["BOLLARDS BETWEEN OPPOSING LANES", "4m", "12m", "18m"]];
rows.forEach((row, r) => {
  const y = ny0 + 36 + r * 42;
  add(`<rect x="${lx}" y="${y}" width="${lw}" height="42" fill="none" stroke="#000"/>`);
  cols.slice(1, -1).forEach(cx => add(`<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 42}" stroke="#000"/>`));
  row.forEach((c, k) => text((cols[k] + cols[k + 1]) / 2, y + 26, c, r === 0 ? 13 : 13, `text-anchor="middle" font-weight="bold" fill="${r === 0 ? (k === 0 ? "#1a7f37" : "#c00") : "#000"}"`));
});

// ---------- Title block, same grid as the sample ----------
const ty = 1230;
add(`<rect x="${MAP.x}" y="${ty}" width="${MAP.w}" height="60" fill="#fff" stroke="#d11" stroke-width="2"/>`);
text(MAP.x + 10, ty + 24, "PROJECT / STAGE:", 16);
text(MAP.x + 190, ty + 24, "KERBSIDE WORKS, SWANSTON ST EAST SIDE, OPPOSITE SIDNEY MYER ASIA CENTRE. STAGE 1", 16);
const tb = 1300, tbH = H - 20 - tb;
add(`<rect x="10" y="${tb}" width="${W - 20}" height="${tbH}" fill="#fff" stroke="#000" stroke-width="3"/>`);
const tcols = [10, 560, 1030, 1240, 1740, W - 10];
tcols.slice(1, -1).forEach(x => add(`<line x1="${x}" y1="${tb}" x2="${x}" y2="${H - 10}" stroke="#000" stroke-width="2"/>`));
const cellRows = 4, rh = tbH / cellRows;
for (let r = 1; r < cellRows; r++) for (const [a, b] of [[10, 560], [560, 1030]]) add(`<line x1="${a}" y1="${tb + r * rh}" x2="${b}" y2="${tb + r * rh}" stroke="#000" stroke-width="2"/>`);
[["PRECINCT:", "PARKVILLE"], ["STREET  :", "SWANSTON ST (GRATTAN ST TO FARADAY ST)"], ["COUNCIL :", "CITY OF MELBOURNE"], ["MEL REF  :", "2B C10"]].forEach(([k, v], i) => { text(22, tb + i * rh + 34, k, 20); text(160, tb + i * rh + 34, v, 14); });
[["DRAWING NUMBER:", "BB-TEST-001"], ["CREATED DATE:", "30/09/2026"], ["DESC:", "SB LANE CLOSURE, DETOUR"], ["AUTHOR:", "BARRIER BRAIN (TEST)"]].forEach(([k, v], i) => { text(572, tb + i * rh + 34, k, 18); text(800, tb + i * rh + 34, v, 14); });
// North arrow and scale.
const cx = 1135, cy = tb + 150;
add(`<polygon points="${cx},${cy - 110} ${cx + 12},${cy - 12} ${cx - 12},${cy - 12}" fill="#000"/><polygon points="${cx},${cy + 110} ${cx + 12},${cy + 12} ${cx - 12},${cy + 12}" fill="#fff" stroke="#000"/><polygon points="${cx - 110},${cy} ${cx - 12},${cy + 12} ${cx - 12},${cy - 12}" fill="#fff" stroke="#000"/><polygon points="${cx + 110},${cy} ${cx + 12},${cy + 12} ${cx + 12},${cy - 12}" fill="#000"/><circle cx="${cx}" cy="${cy}" r="14" fill="#fff" stroke="#000" stroke-width="2"/>`);
text(cx, tb + 30, "N", 20, `text-anchor="middle" font-weight="bold"`);
text(1040, H - 26, "SCALE:", 18);
const sbx = 1110, sby = H - 42, m10 = 10 / MPP * K;
for (let i = 0; i < 3; i++) add(`<rect x="${sbx + i * m10}" y="${sby}" width="${m10}" height="8" fill="${i % 2 ? "#fff" : "#000"}" stroke="#000"/>`);
text(sbx + 3 * m10 + 6, sby + 9, "30 m", 12);
text(1252, tb + 28, "TRAFFIC CONSULTANT:", 16);
text(1752, tb + 28, "CONDITIONS:", 16);
text(1752, tb + 64, "TEST DRAWING FOR SOFTWARE TESTING.", 15, `fill="#c00" font-weight="bold"`);
text(1752, tb + 86, "NOT FOR USE ON SITE.", 15, `fill="#c00" font-weight="bold"`);
text(1752, tb + 130, "Aerial: Vicmap Basemap, State of Victoria (CC BY 4.0).", 13);
text(1752, tb + 150, "Street positions: OpenStreetMap contributors (ODbL).", 13);

// ---------- Compose ----------
const mapImg = await sharp(aerial).extract({ left: CROP.x, top: CROP.y, width: CROP.w, height: CROP.h }).resize(MAP.w, MAP.h).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("\n")}</svg>`;
const base = await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } }).png().toBuffer();
const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
// White page from the SVG first, then the aerial into the map frame, then the overlays on top.
const page = await sharp(base).composite([{ input: mapImg, left: MAP.x, top: MAP.y }]).png().toBuffer();
const svgNoBg = svg.replace(`<rect width="${W}" height="${H}" fill="#fff"/>`, "");
await sharp(page).composite([{ input: Buffer.from(svgNoBg) }]).jpeg({ quality: 88 }).toFile(join(here, "swanston-smac-lane-closure.jpg"));
void overlay;
console.log("wrote swanston-smac-lane-closure.jpg");
