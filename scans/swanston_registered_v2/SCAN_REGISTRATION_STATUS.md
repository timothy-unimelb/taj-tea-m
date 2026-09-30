# Swanston St site scans: registration status and handoff

*Last updated 30 Sep 2026 (FEIT Smart City Hackathon, team Taj Tea-m, product "Barrier Brain").*
Project root: `C:\Users\T\Documents\Subjects\FEIT Smart City Hackathon`

**In the Barrier Brain repo:** this file, `transforms_v2.json`, the registration code (`registration_code/`, unzipped) and `tools/scan_register/` are committed at the same paths. The scan files themselves (`.las` / `.zip`, 25 MB for v2) and the superseded v1 folder are not in the repo. They are in Tamara's local project folder.

## Automated in the app (Advait, 30 Sep evening)

The registration now runs automatically in the browser when several LAS scans are uploaded, and from the command line (`tools/scan_register/register.ts`). It is a TypeScript port of the approach below with the manual steps replaced by checks (`lib/scan/register.ts`, `lib/scan/georef.ts`, `lib/scan/site-scan.ts`):

1. Scan to scan. Pairs join nearest first by phone position, then whole groups fit each other. For each join: a coarse search over heading (plus or minus 45 degrees) and shift (20 m) by FFT cross-correlation of top-down rasters (object height, kerb edges, ground texture), the best 20 peaks refined at 10 cm, screened, and the best 6 fitted by point-to-plane ICP (heading and position, then all six degrees of freedom with tilt held under 3 degrees). Each fit is checked: ICP residual, overlap, objects sitting on the other scan's open ground (compact objects counted one by one, since walls line up at any shift along themselves), wall-to-wall fit, and ground-texture correlation. The checks are added up as evidence, so a fit backed by more overlap counts for more. Then three joint rounds.
2. Map placement. Council building footprints, footpaths and street trees (or OpenStreetMap elsewhere) are fetched for the site. Tall vertical structures in the scan (building faces, trunks, poles) are matched to the map by a kernel chamfer search over heading and shift, then 2D ICP. The map also decides between fits the scans alone cannot separate, and can join groups that share too little to fit directly.
3. Honesty. A scan with no consistent fit keeps its phone position and says so. The map placement is applied only when it is convincing (trees agree, or walls fit well with no near-equal rival); otherwise the phone position is kept with a note.

Where it stands on these four scans: 101315 to 101840 and 103212 to 102451 fit as in v2 (the latter within the wall-versus-kerb ambiguity noted below, about 4 degrees). The join between the two groups is the 16 m stencil trap: the scans alone reject the trap now but cannot find the true placement, because the true overlap is only the sparse ends of the scans. The map step should settle it as it did for you, but on this site it does not yet: my building-face and trunk features are still too noisy (the shop fronts are seen through, and the footpath polygons do not follow the kerb), so the placement is withheld and the north group stays at its phone position. On synthetic scans with the same kinds of error, the whole pipeline lands every scan within 5 cm of each other and 0.5 m on the map. Next: cleaner building-face and trunk features, and your v2 LAS files to derive exact truth for the real pair (the transforms JSON is rounded to six decimals, which is about 3 m at these coordinates).

## Goal
1. Register the four raw Scaniverse LiDAR scans (iPhone 16, 30 Sep 2026) to each other.
2. Place the combined cloud at its true capture location.

The result feeds the Barrier Brain app's "LiDAR site scan → analyse site scan" steps.

## Status at a glance
| Step | Status |
|---|---|
| Scan-to-scan registration | **Done (v2).** A 16 m error in v1 was fixed; see below |
| Georeference (lateral) | **Best estimate applied in v2.** The user will fine-tune it with the satellite tool |
| Heights (Z) | **Not done.** Still phone GPS heights, not AHD |
| Satellite-guided registration tool | **Built and tested** (`tools\scan_register\`); not yet run by the user against real imagery |
| Final registered cloud | **Waiting on the user.** Merge v2, align in the tool, apply the transform |

**Next action for the user:**
1. Unzip the v2 scans.
2. Run `tools\scan_register\merge_scans.bat merged_v2.las scan_101315_v2.las scan_101840_v2.las scan_102451_v2.las scan_103212_v2.las`.
3. Drag `merged_v2.las` onto `register_scan.bat`, line it up on the imagery and click **Save transform**.
4. Run `apply_transform.bat merged_v2.las merged_v2_transform.json`.

## Files
| Path (under project root) | What |
|---|---|
| `scans\swanston_registered_v2\scan_<id>_v2.las/.zip` | **Current best** per-scan clouds, EPSG:32755, full resolution. `101315` is a .las; the other three are zipped because of a 20 MB transfer limit |
| `scans\swanston_registered_v2\transforms_v2.json` | 4×4 transform per scan: raw UTM → v2 UTM |
| `scans\swanston_registered_v2\registration_code\` (locally `_registration_code.zip`) | Python used for the registration (numpy, scipy, OpenCV; run in a cloud sandbox) |
| `scans\swanston_registered_v2\SCAN_REGISTRATION_STATUS.md` | This file |
| `scans\swanston_registered\` | **v1, superseded.** Scan 102451 is ~16 m wrong. Its `reference_CoM_kerbs_buildings.las` (council kerbs, building outlines and bike lanes as points) is still useful |
| `tools\scan_register\scan_register.py` + `.bat` files + `README.md` | Interactive satellite-imagery registration tool: `prepare` / `apply` / `merge` |
| `Claude outputs\_ref_clip.json`, `_scan_map_clip.json` | Council data clipped around the site (scratch; safe to delete) |
| `presentation\site_scan_location_map.png` | Map from the **disregarded** earlier merged scan. Obsolete |

The raw scans are **not** in the project folder; they were uploaded to the chat:
- `Scaniverse 2026-09-30 101315 1.las` (169k points)
- `… 101840 1.las` (819k)
- `… 102451 1.las` (852k)
- `… 103212 1.las` (694k)

All are LAS 1.2, point format 2, scale 0.0001, with GeoKeys EPSG:32755 (WGS 84 / UTM 55S). Time order is 10:13 → 10:32, and the user walked south.
A separate earlier file, `Scaniverse 2026-09-30 site-scan-merged.las`, was **disregarded at the user's request**. Don't use it.

## What was learned
- **Phone georeferencing is poor.**
  - Heading comes from the compass and is out by up to about 25° per scan.
  - Positions are out by about 10–20 m.
  - Heights are GPS, about 41–42 m at the site; the vertical datum is unknown.
  - Gravity (tilt) is good, under 2°.
- **Ground markings repeat.** There are three near-identical bike stencils along the green lane.
  - SIFT matching on top-down colour images wrongly matched scan 102451 to 101840's stencil, which caused v1's 16 m error.
- **What worked for scan-to-scan:**
  1. Top-down colour "ortho" images at 2.5 cm.
  2. Texture-gradient cross-correlation over yaw and shift (`texcorr.py`), for the coarse fit.
  3. 6-DOF point-to-plane ICP with trimming and tilt kept small (`icp.py` `icp6`), for the fine fit.
  4. Checks: occupancy consistency, i.e. do objects in one scan sit where the other saw open ground (`occfast.py`), and wall-to-wall distances (`pairmetrics.py`).
- **The raw GPS along-street trend confirms the order.** Scan centroids step south about 4, 11 and 16 m, and v2 agrees with it.

## v2 registration: numbers
The anchor is 101840, and the frame is then georeferenced as below. ICP RMS is point-to-plane, in overlaps.
- **101315 ↔ 101840:** RMS 4 cm, overlap 79%; object consistency 0.82 (a known-good pair is about 0.83).
- **102451 ↔ (101315 + 101840):** RMS 3 cm, overlap 23%; consistency 0.75–0.83. Moved 16 m south and 3.9° from v1.
- **103212 ↔ 102451:** RMS 3.5 cm; ground median 1.7 cm; walls median 5.6 cm; consistency 0.78.
  - **Known flaw:** on the diagonal brick wall at the recessed entrance, 103212's wall sits 0.53 m east of 102451's copy of the same wall. Fitting to walls instead needs about 4.5° of rotation, which breaks the kerb lines. That points to drift/bending inside one scan, which a rigid transform can't fix. It was left as the ground/kerb-consistent solution.
- Combined cloud: about 55 m of street, 2.53 M points.

## v2 georeference: how the position was chosen
The site is the **east side of Swanston St, between Grattan St and Faraday St**, Carlton, next to the University of Melbourne. From west to east the scan shows:
- a traffic lane
- a low separator kerb
- a green separated bike lane (~2.6 m)
- a kerb
- the footpath (~4.9 m kerb to wall)
- brick walls and building faces with a V-shaped recessed entrance

Evidence for the chosen position (kerb at the scan's y=0 sits at about u = 52.5 m along the street, measured north from the Grattan St kerb corner):
1. **GPS.** The raw GPS along-street offsets of all four scans agree with this position to 1.5 m (standard deviation; mean offset −54 m from the first candidate tried).
2. **Buildings.** Walls fitted to City of Melbourne 2023 building footprints (2D ICP), mean truncated distance 0.31 m. Matches include:
   - the building recess at the south end
   - side walls at the building gap
   - the north building corner
3. **Street trees.** Four council street trees each have a scanned object within 0.4–0.8 m: English Elms (trunk diameters 28 and 25 cm) and a young Sapporo elm with its guard, 2.65 m tall.

The building footprints alone can't pin the along-street position: candidates 25–100 m apart scored almost the same. GPS and the trees decided it.

Transform from the v2 local frame to the map, in local coordinates with origin (320760, 5814440): yaw −6.18°, translation (9.34, 1.39) m. It is already baked into the v2 files.

**Estimated accuracy:** about 0.5–1 m horizontally and about 1° in heading. The council data itself is ±0.5 m.
- The scanned kerb sits about 1.3–1.6 m west of the council's footway-polygon edge while the walls match the buildings, so trust building faces over that polygon edge.
- Council coordinates are MGA/GDA; the difference from WGS 84 at this scale is under 1 m.

## Open items / ideas
1. **User:** fine-tune laterally in the satellite tool. Expect an adjustment under about 1–2 m and a few degrees. Keep scale locked at 1.
2. **Heights to AHD (not done; the user stopped this).** Options:
   - Council building `structure_min_elevation` values touching the scan: 39.6 and 42.5 m AHD.
   - The footway polygon for Swanston St east (Grattan→Faraday) runs rl 37.9 → 43.11 m over about 200.6 m, a ~2.6% grade. The scan's own ground slope is about 2%.
   - A grade-based estimate gives about 39.4 m AHD at the scan centre, compared with ~41.8 m GPS, i.e. about −2.4 m. **Unverified.**
3. **Optional:** a non-rigid fix for the 0.5 m wall disagreement between 102451 and 103212, e.g. split 103212 into two rigid pieces.
4. Once the final cloud exists, redo `presentation\site_scan_location_map.png`. The current one is from the disregarded file.

## Satellite tool (`tools\scan_register\scan_register.py`)
- **Requirements:** Python 3 and numpy only.
- **`prepare scan.las [--res 0.04] [--mode top|ground] [--init transform.json]`:** renders a top-down PNG (highest point per pixel) and writes `<name>_register.html` with it embedded.
  - The page draws Esri World Imagery tiles on a canvas in Web Mercator, converting UTM to lat/lon in JavaScript.
  - Move, rotate (about the cloud centre) and scale by drag, keys or number boxes.
  - Saves a transform `.json`.
- **`apply scan.las transform.json out.las [--scale-z]`:** rewrites only the X/Y/Z integers in each point record, re-centres the offsets and updates the bounds. Every other attribute is untouched. Tested: 0.05 mm error.
- **`merge out.las in1.las in2.las …`:** concatenates files with the same point format.
- **Transform:** `E',N' = s·R(θ)·([E,N] − pivot) + pivot + t`. The JSON also holds `matrix_4x4_absolute` for CloudCompare.
- Tested headless in a sandbox where the imagery was blocked, so the drawing of the real imagery hasn't been seen yet.
