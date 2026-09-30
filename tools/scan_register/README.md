# scan_register: line a point cloud up with satellite imagery (bird's-eye view)

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
