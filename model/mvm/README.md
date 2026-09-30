# Minimum viable closure-impact model (MVM)

**How it works:** a lookup table learned from past Melbourne closures, followed by an hour-by-hour queue calculation.
- **Closures:** RADAR (national roadworks feed), Greater Melbourne, 2024–26, ≤7 days: 6,514 closures, 3,075 of them within 200 m of a signalised intersection.
- **Traffic:** SCATS signal volumes.
- **Build:** `python model/mvm/build_mvm.py` (about 15 seconds). It reads the flat parquet made by `model/build_parquet.py`. The original warehouse build, `run_mvm.py` with the SQL files, gives the same results and is kept for reference.

| File | What it does |
|---|---|
| `01_closures_pairs.sql` | Clean the closures and parse the DTP text (impact type, work hours → night / day / 24 hours); link each closure to signal sites ≤200 m away (same street vs cross street) |
| `02_site_band.sql` | Complete site-days only; volume per time band (AM peak 7–9, inter-peak 9–16, PM peak 16–19, night 19–7) |
| `03_impact.sql` | Closure day vs median of the same site/band/weekday over the previous 6 weeks. Baseline days exclude holidays and days with other nearby works |
| `04_lookup.sql` | **The model:** P10/P50/P90 of the traffic change and the share of closures with a >15% drop, by closure type × work window × time band × road class. Levels 2 and 3 are fallbacks; only groups with ≥20 closures are kept |
| `05_validation.sql` | Train on closures before 2026, test on 2026 closures |
| `mvm_predict.py` | `predict()` / `compare_windows()`: lookup + queue → delay (veh-h), max queue (m), forced diversions, and the recommended work window |
| `output/*.csv` | Lookup, per-closure results (with lat/lon, for Tableau), validation tables |

## Assumptions (state these in the pitch; all are parameters)
- Capacity: 800 veh/h per lane.
- Work-zone factor: 0.85.
- Direction split: 50/50.
- Tolerable queue: 500 m per lane. Vehicles beyond it are counted as forced diversions.
- Hourly demand = AADT × the weekday hourly profile from `headline_stats`.
- `$` cost only when a value of time is supplied (source it from ATAP).

## Caveats
- SCATS counts are **whole-intersection** totals (all approaches). A lane closure on one approach is diluted, so the % changes understate the effect on the closed approach itself.
- RADAR date ranges are indicative; works may not run every day in the range.
