// Draws a test traffic guidance scheme (TGS) for Swanston St outside the
// Sidney Myer Asia Centre, between Grattan St and Faraday St, Parkville.
// Street layout from OpenStreetMap (30 Sep 2026): one northbound lane and a
// bike track on the west side, tram tracks in the middle, 40 km/h.
// Faraday St joins from the east about 213 m north of Grattan St.
// Test data only. Not a real plan and not for use on site.
//
// Run: node data/test/make-smac-tgs.mjs  (writes swanston-smac-lane-closure.png)

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const W = 2400, H = 1700;

// Plan view, north to the right. x is metres north of the Grattan St kerb line,
// y is metres east of the west building line (SMAC side at the top).
const PX = 6.4, X0 = 80 + 45 * PX, Y0 = 560;
const X = m => X0 + m * PX;
const Y = m => Y0 + m * PX;

// Cross-section, west to east, in metres.
const S = {
  footW: [0, 5], kerbW: 5, bike: [5.2, 7.2], sep: 7.5, nb: [7.5, 10.8],
  tram: [10.8, 17.5], sb: [17.5, 20.8], bikeE: [20.8, 22.3], footE: [22.3, 27],
};
const Xmin = -45, Xmax = 238;
const grattan = [-22, 0];
const monash = [201, 207];
const faraday = [206, 220];
const workZone = [95, 170];
const closureStart = 2, closureEnd = 201;

const out = [];
const add = s => out.push(s);
const rect = (x1, y1, x2, y2, fill, extra = "") => add(`<rect x="${X(x1)}" y="${Y(y1)}" width="${(x2 - x1) * PX}" height="${(y2 - y1) * PX}" fill="${fill}" ${extra}/>`);
const line = (x1, y1, x2, y2, stroke, w = 2, extra = "") => add(`<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`);
const text = (px, py, s, size = 16, extra = "") => add(`<text x="${px}" y="${py}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" ${extra}>${String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`);

// Sign callout: yellow panel with black text and a leader line to its spot.
function sign(px, py, lines, at, opts = {}) {
  const w = opts.w ?? 190, lh = 19, h = lines.length * lh + 16;
  if (at) add(`<line x1="${px + w / 2}" y1="${py + (at[1] < py ? 0 : h)}" x2="${X(at[0])}" y2="${Y(at[1])}" stroke="#000" stroke-width="1.6"/>`);
  if (at) add(`<circle cx="${X(at[0])}" cy="${Y(at[1])}" r="5" fill="#000"/>`);
  add(`<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${opts.fill ?? "#ffe600"}" stroke="#000" stroke-width="2"/>`);
  lines.forEach((l, i) => text(px + w / 2, py + 24 + i * lh, l, 15, `text-anchor="middle" font-weight="bold" fill="${opts.color ?? "#000"}"`));
}

add(`<rect width="${W}" height="${H}" fill="#fff"/>`);
add(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#000" stroke-width="3"/>`);

// Base: land, buildings, footpaths.
add(`<rect x="22" y="22" width="1880" height="1370" fill="#eef0ea"/>`);
rect(Xmin, -40, Xmax, 0, "#dcdcd4");
rect(Xmin, 27, Xmax, 70, "#dcdcd4");
rect(62, -34, 196, -2, "#c9c3b5", `stroke="#8a8272" stroke-width="2"`);
text(X(129), Y(-17), "SIDNEY MYER ASIA CENTRE (Building 158)", 20, `text-anchor="middle" font-weight="bold" fill="#3b3a36"`);
text(X(129), Y(-10), "Main entry and forecourt", 15, `text-anchor="middle" fill="#3b3a36"`);
add(`<rect x="${X(118)}" y="${Y(-2.5)}" width="${22 * PX}" height="${2.5 * PX}" fill="#b8b09e"/>`);
text(X(129), Y(-3.4), "ENTRY", 12, `text-anchor="middle" fill="#3b3a36"`);
rect(8, 29, 60, 60, "#c9c3b5", `stroke="#8a8272" stroke-width="2"`);
rect(66, 29, 196, 60, "#c9c3b5", `stroke="#8a8272" stroke-width="2"`);
text(X(130), Y(46), "CARLTON (east side of Swanston St)", 16, `text-anchor="middle" fill="#3b3a36"`);

// Cross streets.
rect(grattan[0], -40, grattan[1], 70, "#9a9a9a");
rect(monash[0], -40, monash[1], S.kerbW, "#b3b3b3");
rect(faraday[0], S.footE[0], faraday[1], 70, "#9a9a9a");
add(`<text transform="translate(${X(-11) + 6},${Y(-8)}) rotate(-90)" font-family="Arial" font-size="18" font-weight="bold" fill="#fff">GRATTAN STREET</text>`);
add(`<text transform="translate(${X(204) + 6},${Y(-6)}) rotate(-90)" font-family="Arial" font-size="13" font-weight="bold" fill="#333">MONASH RD</text>`);
add(`<text transform="translate(${X(213) + 6},${Y(64)}) rotate(-90)" font-family="Arial" font-size="17" font-weight="bold" fill="#fff">FARADAY STREET</text>`);

// Swanston St carriageway.
rect(Xmin, S.footW[0], Xmax, S.footW[1], "#d6d3cc");
rect(Xmin, S.footE[0], Xmax, S.footE[1], "#d6d3cc");
rect(Xmin, S.kerbW, Xmax, S.footE[0], "#8f8f8f");
rect(Xmin, S.bike[0], Xmax, S.bike[1], "#6f9a74");
rect(Xmin, S.bikeE[0], Xmax, S.bikeE[1], "#6f9a74");
rect(grattan[0], -40, grattan[1], 70, "#9a9a9a");
rect(faraday[0], S.footE[0], faraday[1], 70, "#9a9a9a");
line(Xmin, S.sep, Xmax, S.sep, "#fff", 3);
line(Xmin, S.kerbW, Xmax, S.kerbW, "#222", 3);
line(Xmin, S.footE[0], Xmax, S.footE[0], "#222", 3);
for (const [a, b] of [[Xmin, grattan[0]], [grattan[1], Xmax]]) {
  line(a, S.nb[1], b, S.nb[1], "#fff", 2, `stroke-dasharray="18 12"`);
  line(a, S.sb[0], b, S.sb[0], "#fff", 2, `stroke-dasharray="18 12"`);
}
for (const t of [12.3, 13.8, 14.6, 16.1]) line(Xmin, t, Xmax, t, "#4a4a4a", 2.5);
text(X(60), Y(14.3) + 5, "TRAM TRACKS (routes 1, 3, 5, 6, 16, 64, 67, 72)", 14, `fill="#fff" font-weight="bold"`);
text(X(-40), Y(9.7), "NORTHBOUND  →", 14, `fill="#fff" font-weight="bold"`);
text(X(-40), Y(19.8), "←  SOUTHBOUND", 14, `fill="#fff" font-weight="bold"`);
text(X(-40), Y(6.7), "BIKE TRACK", 12, `fill="#fff"`);
text(X(-40), Y(22), "BIKE LANE", 12, `fill="#fff"`);
text(X(-40), Y(3), "FOOTPATH", 12, `fill="#333"`);
text(X(-43), Y(-24), "SWANSTON STREET", 22, `font-weight="bold" fill="#222"`);

// Lane closure and work zone in the northbound lane.
rect(closureStart, S.nb[0], closureEnd, S.nb[1], "#fff27a", `opacity="0.85"`);
rect(workZone[0], S.nb[0], workZone[1], S.nb[1], "#5cc15c", `opacity="0.9"`);
text(X(132), Y(9.6), "WORK AREA  75 m", 15, `text-anchor="middle" font-weight="bold"`);
text(X(50), Y(9.6), "LANE CLOSED", 14, `text-anchor="middle" font-weight="bold"`);

// Water-filled barriers on the tram side for the whole closure, and between
// the work area and the bike track.
line(closureStart + 12, S.nb[1] - 0.2, closureEnd - 4, S.nb[1] - 0.2, "#e11", 5);
line(workZone[0], S.nb[0] + 0.2, workZone[1], S.nb[0] + 0.2, "#e11", 5);
// Merge taper across the lane at Grattan St, bollards at 4 m spacing.
for (let i = 0; i <= 3; i++) add(`<circle cx="${X(closureStart + i * 4)}" cy="${Y(S.nb[1] - 0.3 - i * 1.0)}" r="5" fill="#f28c00" stroke="#000"/>`);
for (let i = 0; i <= 2; i++) add(`<circle cx="${X(closureEnd - 4 + i * 2)}" cy="${Y(S.nb[1] - 0.3 - i * 1.4)}" r="5" fill="#f28c00" stroke="#000"/>`);

// Traffic controllers, VMS boards, signs.
function tc(xm, ym, label) {
  add(`<circle cx="${X(xm)}" cy="${Y(ym)}" r="9" fill="#ffe600" stroke="#000" stroke-width="2"/>`);
  text(X(xm) + 12, Y(ym) + 5, label, 13, `font-weight="bold"`);
}
tc(-3, 8.6, "TC 1");
tc(-3, 19, "TC 2");
function vms(xm, ym, label) {
  add(`<rect x="${X(xm) - 9}" y="${Y(ym) - 9}" width="18" height="18" fill="#111" stroke="#ffe600" stroke-width="3"/>`);
  text(X(xm) + 14, Y(ym) + 5, label, 13, `font-weight="bold"`);
}
vms(-42, 3.8, "VMS 1");
vms(-15, 50, "VMS 2");

sign(90, 200, ["VMS 1 (SWANSTON ST, SOUTH OF GRATTAN)", "PANEL 1: SWANSTON ST NTH", "CLOSED AT GRATTAN ST", "PANEL 2: DETOUR VIA", "CARDIGAN ST"], [-42, 3.8], { w: 330 });
sign(450, 200, ["NORTHBOUND", "CLOSED", "DETOUR →"], [-8, 8], { w: 170 });
sign(650, 200, ["ROAD WORK", "AHEAD"], [-30, 5.5], { w: 150, fill: "#f28c00" });
sign(820, 250, ["BIKE TRACK OPEN", "KEEP LEFT OF BARRIERS"], [100, 6.2], { w: 250 });
sign(1100, 180, ["FOOTPATH OPEN", "KEEP 2.0 m CLEAR AT", "SMAC ENTRY"], [127, 2.5], { w: 230 });
sign(1380, 200, ["END", "ROAD WORK"], [205, 3], { w: 150, fill: "#f28c00" });
sign(1560, 250, ["NO ENTRY", "FROM MONASH RD", "TO SWANSTON ST SOUTH"], [204, 4.5], { w: 230, fill: "#fff", color: "#c00" });
sign(120, 1010, ["VMS 2 (GRATTAN ST, EAST OF SWANSTON)", "PANEL 1: SWANSTON ST NTH", "CLOSED", "PANEL 2: USE CARDIGAN ST"], [-15, 50], { w: 330 });
sign(520, 1010, ["TRAFFIC CONTROLLERS HOLD", "PEDESTRIANS AND CYCLISTS", "WHILE PLANT CROSSES", "THE BIKE TRACK"], [-3, 19], { w: 300 });
sign(900, 1060, ["DETOUR ↑", "(FARADAY ST TO", "SWANSTON ST)"], [213, 40], { w: 200 });

// Notes on the drawing.
add(`<rect x="1250" y="1020" width="620" height="150" fill="#ffe600" stroke="#000" stroke-width="2"/>`);
text(1265, 1050, "NOTES:", 18, `font-weight="bold"`);
text(1265, 1078, "1. Works within 20 m of tram tracks. Yarra Trams approval required.", 15);
text(1265, 1102, "2. Barriers to stay 0.8 m clear of the tram kinematic envelope.", 15);
text(1265, 1126, "3. Bike track stays open, minimum 1.5 m clear width past the work area.", 15);
text(1265, 1150, "4. Southbound lane and trams unaffected.", 15);

// Dimension lines.
function dim(x1, x2, ym, label) {
  line(x1, ym, x2, ym, "#c00", 1.8, `marker-start="url(#a)" marker-end="url(#a)"`);
  text((X(x1) + X(x2)) / 2, Y(ym) - 6, label, 14, `text-anchor="middle" fill="#c00" font-weight="bold"`);
}
add(`<defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#c00"/></marker></defs>`);
dim(workZone[0], workZone[1], 32, "75.0 m");
dim(0, 30, 32, "30.0 m");
dim(closureStart, closureEnd, 36.5, "LANE CLOSURE 199 m (GRATTAN ST TO MONASH RD)");
add(`<line x1="${X(238) - 20}" y1="${Y(0)}" x2="${X(238) - 20}" y2="${Y(5)}" stroke="#c00" stroke-width="1.8" marker-start="url(#a)" marker-end="url(#a)"/>`);
text(X(238) - 26, Y(2.5) + 5, "5.0 m", 13, `text-anchor="end" fill="#c00" font-weight="bold"`);
add(`<line x1="${X(238) - 20}" y1="${Y(S.nb[0])}" x2="${X(238) - 20}" y2="${Y(S.nb[1])}" stroke="#c00" stroke-width="1.8" marker-start="url(#a)" marker-end="url(#a)"/>`);
text(X(238) - 26, Y(9.15) + 5, "3.3 m", 13, `text-anchor="end" fill="#c00" font-weight="bold"`);
add(`<line x1="${X(238) - 20}" y1="${Y(S.bike[0])}" x2="${X(238) - 20}" y2="${Y(S.bike[1])}" stroke="#c00" stroke-width="1.8"/>`);
text(X(238) - 26, Y(6.2) + 5, "2.0 m", 13, `text-anchor="end" fill="#c00" font-weight="bold"`);

// Detour inset map.
const ix = 60, iy = 50, iw = 520, ih = 130;
add(`<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#fff" stroke="#000" stroke-width="2"/>`);
text(ix + 8, iy + 20, "DETOUR (NORTHBOUND)  Mon to Fri 9:30am to 3:30pm", 14, `font-weight="bold"`);
add(`<line x1="${ix + 40}" y1="${iy + 95}" x2="${ix + 500}" y2="${iy + 95}" stroke="#888" stroke-width="10"/>`);
add(`<line x1="${ix + 40}" y1="${iy + 50}" x2="${ix + 500}" y2="${iy + 50}" stroke="#888" stroke-width="10"/>`);
add(`<line x1="${ix + 110}" y1="${iy + 35}" x2="${ix + 110}" y2="${iy + 120}" stroke="#888" stroke-width="10"/>`);
add(`<line x1="${ix + 420}" y1="${iy + 35}" x2="${ix + 420}" y2="${iy + 120}" stroke="#888" stroke-width="10"/>`);
text(ix + 45, iy + 88, "SWANSTON ST", 12);
text(ix + 45, iy + 43, "CARDIGAN ST", 12);
text(ix + 116, iy + 125, "GRATTAN ST", 12);
text(ix + 426, iy + 125, "FARADAY ST", 12);
add(`<polyline points="${ix + 60},${iy + 95} ${ix + 110},${iy + 95} ${ix + 110},${iy + 50} ${ix + 420},${iy + 50} ${ix + 420},${iy + 95} ${ix + 495},${iy + 95}" fill="none" stroke="#1450d2" stroke-width="4" marker-end="url(#b)"/>`);
add(`<defs><marker id="b" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1450d2"/></marker></defs>`);
add(`<line x1="${ix + 150}" y1="${iy + 95}" x2="${ix + 400}" y2="${iy + 95}" stroke="#e11" stroke-width="5" stroke-dasharray="10 6"/>`);
text(ix + 210, iy + 115, "CLOSED NB", 12, `fill="#e11" font-weight="bold"`);

// Legend.
const lx = 1920, ly = 40;
add(`<rect x="${lx}" y="${ly}" width="450" height="1350" fill="#fff" stroke="#000" stroke-width="2"/>`);
text(lx + 225, ly + 40, "LEGEND", 26, `text-anchor="middle"`);
const legend = [
  ["WORK AREA", s => add(`<rect x="${s[0]}" y="${s[1] - 12}" width="70" height="18" fill="#5cc15c"/>`)],
  ["LANE CLOSURE", s => add(`<rect x="${s[0]}" y="${s[1] - 12}" width="70" height="18" fill="#fff27a" stroke="#999"/>`)],
  ["WATER FILLED BARRIERS", s => add(`<line x1="${s[0]}" y1="${s[1] - 3}" x2="${s[0] + 70}" y2="${s[1] - 3}" stroke="#e11" stroke-width="5"/>`)],
  ["BOLLARDS / CONES (4 m)", s => { for (let i = 0; i < 3; i++) add(`<circle cx="${s[0] + 10 + i * 25}" cy="${s[1] - 3}" r="5" fill="#f28c00" stroke="#000"/>`); }],
  ["TRAFFIC CONTROLLER", s => add(`<circle cx="${s[0] + 35}" cy="${s[1] - 3}" r="9" fill="#ffe600" stroke="#000" stroke-width="2"/>`)],
  ["CLASS A VMS", s => add(`<rect x="${s[0] + 26}" y="${s[1] - 12}" width="18" height="18" fill="#111" stroke="#ffe600" stroke-width="3"/>`)],
  ["DETOUR ROUTE", s => add(`<line x1="${s[0]}" y1="${s[1] - 3}" x2="${s[0] + 70}" y2="${s[1] - 3}" stroke="#1450d2" stroke-width="4"/>`)],
  ["BIKE TRACK / LANE", s => add(`<rect x="${s[0]}" y="${s[1] - 12}" width="70" height="18" fill="#6f9a74"/>`)],
  ["TRAM TRACKS", s => { add(`<line x1="${s[0]}" y1="${s[1] - 7}" x2="${s[0] + 70}" y2="${s[1] - 7}" stroke="#4a4a4a" stroke-width="2.5"/>`); add(`<line x1="${s[0]}" y1="${s[1] + 1}" x2="${s[0] + 70}" y2="${s[1] + 1}" stroke="#4a4a4a" stroke-width="2.5"/>`); }],
];
legend.forEach(([label, draw], i) => { const y = ly + 100 + i * 48; text(lx + 20, y, label, 16); draw([lx + 355, y]); });
text(lx + 20, ly + 560, "BOLLARD SPACING TABLE", 16, `font-weight="bold"`);
[["", "< 50 km/h", "51-70", "> 70"], ["MERGE TAPER", "4 m", "9 m", "12 m"], ["LATERAL SHIFT", "4 m", "12 m", "18 m"], ["ADJACENT CLOSED", "4 m", "18 m", "24 m"]]
  .forEach((row, r) => row.forEach((c, k) => text(lx + 20 + [0, 180, 270, 350][k], ly + 595 + r * 28, c, 14, r === 0 ? `font-weight="bold"` : "")));
text(lx + 20, ly + 740, "SPEED LIMIT: 40 km/h (SWANSTON ST)", 15, `font-weight="bold"`);
text(lx + 20, ly + 770, "Works speed: 40 km/h", 15);
text(lx + 225, ly + 1250, "N →", 42, `text-anchor="middle" font-weight="bold"`);
text(lx + 225, ly + 1290, "North is to the right", 14, `text-anchor="middle"`);
// Scale bar.
const sb0 = lx + 60;
for (let i = 0; i < 3; i++) add(`<rect x="${sb0 + i * 10 * PX}" y="${ly + 1150}" width="${10 * PX}" height="12" fill="${i % 2 ? "#fff" : "#000"}" stroke="#000"/>`);
[0, 10, 20, 30].forEach((m, i) => text(sb0 + i * 10 * PX, ly + 1185, `${m} m`, 13, `text-anchor="middle"`));
text(lx + 225, ly + 1130, "SCALE 1:500 AT A3", 15, `text-anchor="middle" font-weight="bold"`);

// Title block.
const ty = 1400;
add(`<rect x="22" y="${ty}" width="${W - 44}" height="${H - ty - 22}" fill="#fff" stroke="#000" stroke-width="2"/>`);
const cells = [
  [30, "PROJECT / STAGE:", "Kerbside works, Sidney Myer Asia Centre frontage. Stage 1"],
  [30 + 60, "STREET:", "Swanston Street, Parkville (Grattan St to Faraday St)"],
  [30 + 120, "COUNCIL:", "City of Melbourne. Tram route: Yarra Trams"],
  [30 + 180, "WORK HOURS:", "Monday to Friday, 9:30am to 3:30pm (off-peak)"],
];
cells.forEach(([dy, k, v]) => { text(40, ty + dy + 10, k, 16, `font-weight="bold"`); text(250, ty + dy + 10, v, 18); });
add(`<line x1="1100" y1="${ty}" x2="1100" y2="${H - 22}" stroke="#000" stroke-width="2"/>`);
[
  ["DRAWING NUMBER:", "BB-TEST-001  Rev A"],
  ["CREATED DATE:", "30/09/2026"],
  ["DESC:", "Northbound lane closure, detour via Cardigan St"],
  ["AUTHOR:", "Barrier Brain test data"],
].forEach(([k, v], i) => { text(1115, ty + 40 + i * 60, k, 16, `font-weight="bold"`); text(1300, ty + 40 + i * 60, v, 18); });
add(`<line x1="1900" y1="${ty}" x2="1900" y2="${H - 22}" stroke="#000" stroke-width="2"/>`);
text(1915, ty + 40, "CONDITIONS:", 16, `font-weight="bold"`);
text(1915, ty + 70, "TEST DRAWING FOR SOFTWARE", 15, `fill="#c00" font-weight="bold"`);
text(1915, ty + 92, "TESTING. NOT FOR USE ON SITE.", 15, `fill="#c00" font-weight="bold"`);
text(1915, ty + 130, "Base geometry: OpenStreetMap", 14);
text(1915, ty + 150, "contributors (ODbL).", 14);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("\n")}</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(here, "swanston-smac-lane-closure.png"));
console.log("wrote swanston-smac-lane-closure.png");
