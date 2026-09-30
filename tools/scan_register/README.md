# Scan registration tools

Two sets of tools. The first runs the app's automatic registration from the command line. The second is the earlier interactive satellite-imagery tool (Python).

## Automatic registration (TypeScript, the same code the app runs)

The app registers uploaded LAS scans to each other and places the result on the map with no manual step (`lib/scan/site-scan.ts`; how it works is in `scans/swanston_registered_v2/SCAN_REGISTRATION_STATUS.md`). These scripts run that code on files. They need Node and the repo's `node_modules` (`npm install`); `jiti` runs the TypeScript directly.

```
node_modules/.bin/jiti tools/scan_register/register.ts out.las in1.las in2.las ... [--report r.json] [--no-georef] [--reference ref.json] [--save-reference ref.json] [--truth truth.json]
```
Writes the merged, georeferenced LAS, a full log next to it (`out.las.log`) and, with `--report`, a JSON report (per-scan status, fit numbers, map placement). `--no-georef` skips the map step. `--reference` uses saved map data instead of fetching it; `--save-reference` saves what was fetched. `--truth` prints errors against known transforms (synthetic tests).

Other scripts:
- `make_synthetic.ts <dir> [seed]`: four synthetic scans of a street with phone-like errors, plus `truth.json` and `reference.json`. The end-to-end test: make them, register with `--reference` and `--truth`, expect a few cm scan to scan and under 1 m on the map.
- `render.ts out.png report.json scan_dir [--res 0.05] [--ground] [--colour] [--raw] [--reference ref.json] [--v2 transforms.json]`: top-down picture of the scans, one tint each, with the report's transforms applied (or none with `--raw`, or Tamara's v2 transforms), optionally with map data drawn on top.
- `compare_v2.ts report.json`: differences from Tamara's validated Swanston St transforms, per scan. Her JSON is rounded to six decimals against seven-digit coordinates, so positions carry about 3 m of slop; headings are exact.
- `probe.ts fixed.las moving.las yaw tx ty` and `georef_probe.ts scan.las reference.json yaw tx ty`: score a known placement with the same checks the registration uses, for tuning.

Real scans stay out of the repo: put them in `scans/raw/` (git-ignored).

## Interactive satellite tool (Python)

Needs Python 3 with **numpy** (the project `.venv` has it) and internet access in your browser for the imagery.
Works with uncompressed LAS 1.0–1.4 in projected metres (UTM / MGA). Your input file is never modified.

## 1. Open the cloud over satellite imagery
Drag the `.las` onto **register_scan.bat**, or run:
```
python scan_register.py prepare scan.las
```
This writes `scan_register.html` next to the LAS and opens it.

| Action | How |
|---|---|
| Move the cloud | **Move** tool + left-drag, or arrow keys (5 cm; Shift = 50 cm) |
| Rotate | **Rotate** tool + left-drag around the gold pivot (Shift = fine), or `[` `]` (0.1°; Shift = 1°) |
| Scale | untick *lock scale at 1*, then **Scale** tool + drag, or `-` `=` |
| Pan / zoom the map | right- or middle-drag / mouse wheel |
| Compare | opacity slider, **H** to hide/show, *flicker* checkbox, **Z** zoom to cloud |
| Exact values | type into the Move East / North, Rotate, Scale boxes |

Tips: match hard features that don't move: kerb lines, painted markings, pit lids, building corners at ground level.
Avoid roof edges and tree canopies: satellite images are slightly off-nadir, so tall things lean.
Leave scale locked at 1 unless you have a reason; phone LiDAR scale is normally right.
Esri imagery itself can be off by about 0.5–1 m, so check a few features spread across the scan.

Click **Save transform** to download `scan_transform.json`. To carry on later, run
`python scan_register.py prepare scan.las --init scan_transform.json`, or use *Load a saved transform* on the page.

## 2. Apply it to the full cloud
```
python scan_register.py apply scan.las scan_transform.json scan_registered.las
```
(or `apply_transform.bat scan.las scan_transform.json`). The transform moves X/Y only, about the cloud centre:
`E',N' = scale·R(θ)·([E,N] − pivot) + pivot + translation`. Z is unchanged unless you add `--scale-z`.
Every other point attribute (colour, intensity, classification) is copied unchanged.
The JSON also has a 4×4 matrix (`matrix_4x4_absolute`) you can paste into CloudCompare's *Apply transformation*.
Tick "apply to global coordinates" in CloudCompare if you loaded the cloud with a global shift.

## Optional: merge several scans first
```
python scan_register.py merge merged.las scan_a.las scan_b.las ...
```

## Options
`--res 0.03` renders finer (default 0.04 m/px). `--mode ground` draws the lowest point per pixel instead of the highest.
`--epsg 7855` overrides the CRS if the file has none. `--max-points 3000000` renders a subsample for very large clouds.
