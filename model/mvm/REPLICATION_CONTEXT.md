# REPLICATION CONTEXT: Minimum Viable Closure-Impact Model (MVM)

This file holds everything needed to rebuild, check or extend the model without the original conversation.
- **Written:** 29 Sep 2026, during the FEIT Smart City Hackathon (29 Sep – 1 Oct 2026).
- **Challenge:** *Future Cities: Digital Tool for Temporary Infrastructure*. Simulate the knock-on impact of a planned road closure or work zone on traffic, pedestrians and PT, using typical traffic-equipment inventory. The likely sponsor is RPM Hire.

---

## 1. What the model is (one paragraph)
The model is a **lookup table learned from past Melbourne closures**, plus a **deterministic hour-by-hour queue** calculation.
- **Measuring past closures:**
  - Each closure is a RADAR record, the national harmonised roadworks feed.
  - It is linked to the SCATS signalised intersections within 200 m.
  - For each time band on each closure day, traffic volume is compared with the median of the same site, band and weekday over the previous 6 clean weeks.
- **The lookup:** the % changes are summarised by closure type × work window × time band × road class into P10/P50/P90, plus the share of closures with a >15% drop.
- **Prediction:** the matching lookup row is applied to hourly demand from AADT, and a queue is run against the reduced lane capacity. This gives delay (veh-h), maximum queue (m), forced diversions and the recommended work window.
- **No machine learning.** Everything is explainable and auditable.

## 2. Environment and locations
| Item | Value |
|---|---|
| Project root (Windows) | `C:\Users\T\Documents\Subjects\FEIT Smart City Hackathon` |
| Warehouse | `warehouse\city.duckdb`, DuckDB **1.5.5** (≈5.2 GB). Always open **read-only** for analysis |
| Raw data | `raw\<dataset_key>\<yyyymmdd>\<file>`: write-once, read-only, sha256 in `raw\_manifest.csv`. **Never modify raw files**; the analytical schema must be re-computable |
| Pipeline | `pipeline\download.py` + `sources.json` (downloads), `pipeline\run_etl.py` + `pipeline\sql\NN_*.sql` (ETL; builds `city_build.duckdb` then swaps it in). Windows `.bat` wrappers call `.venv\Scripts\python.exe` |
| This model | `analysis\mvm\` (SQL 01–05, `run_mvm.py`, `mvm_predict.py`, `output\*.csv`, `README.md`, this file) |
| Supporting outputs | `analysis\headline_stats\output\01_scats_hourly_profile.csv` (hourly share of daily traffic), `02_scats_site_daily.csv` (avg daily volume per SCATS site by day type) |
| Python deps | `duckdb==1.5.5`, `pandas` |
| Tableau | Generic JDBC to DuckDB (`tools\jdbc\duckdb_jdbc-1.5.5.1.jar`, read-only properties file). Close Tableau before any ETL rebuild (file lock) |

**Claude-side gotchas** (for when an assistant runs this through the desktop bridge VM):
- The VM is Linux: 2 cores, ~3 GB RAM, **45 s per command**, no background processes.
- The project folder is mounted at `$HOME/mnt/FEIT Smart City Hackathon`.
- **Files cannot be deleted** in the mounted folder without user approval, and DuckDB needs to delete its `.wal`. So in the VM, put the scratch DB outside the mount: `export MVM_WORKDB=$HOME/mvm/mvm.duckdb`.
- The VM has **no network** (org allowlist) and **no DuckDB spatial/excel extensions**. The MVM deliberately uses haversine maths, not `ST_*`.
- Views in the warehouse's `tableau` schema reference unqualified tables. When the warehouse is ATTACHed as `w`, they fail ("dim_date does not exist"). Use the base tables (`w.main.dim_date`), not `w.tableau.calendar`.
- Heavy work (downloads, full ETL) is run by the user on Windows via `.bat` files.

## 3. Data sources used (lineage)
| Warehouse table | Built by | Raw dataset key(s) / origin | Notes |
|---|---|---|---|
| `stg.radar_roadworks` | `pipeline/sql/55_closures.sql` | `radar_roadworks_vic` = DITRDCSA National Freight Data Hub **RADAR_Curated_Prod_roadworks** FeatureServer, `state='VIC'`, paged 2,000/file as GeoJSON (27 files) | 48,774 VIC records, captured Sep 2020 → 29 Sep 2026. Dates are epoch ms (UTC). Point geometry. Item: https://spatial.infrastructure.gov.au/portal/home/item.html?id=95dc85472748470ebe9b93241756f5bb ; service: https://spatial.infrastructure.gov.au/server/rest/services/Hosted/RADAR_Curated_Prod_roadworks/FeatureServer/0 |
| `stg.scats_site_hour` | earlier ETL steps (`25_stg_scats`) | `scats_volume` (DTP "Traffic Signal Volume Data", monthly zips of daily VSDATA CSVs: `NB_SCATS_SITE, QT_INTERVAL_COUNT, NB_DETECTOR, V00..V95, NM_REGION, CT_RECORDS, QT_VOLUME_24HOUR, CT_ALARM_24HOUR`) | Summed over detectors and aggregated to site × local date × local hour. Columns: `site_no, date_local, hour_local, volume, n_detectors, n_missing_slots, region`. Covers 2024-01-01 → 2026-09-23 (105M rows) |
| `stg.scats_sites` | `15_stg_scats_sites` | `scats_sites` (DTP Traffic Lights CSV, VicGrid → WGS84) | `site_no, site_name ("PUNT/SWAN"), site_type (INT = signalised intersection), lat, lon, status` |
| `main.dim_date` | `20_dim_geo_time` | generated + Vic public holidays | `date_local, dow (1=Mon..7=Sun), is_weekend, is_public_holiday, holiday_name, ...` |
| AADT (for the queue input) | `57_aadt.sql` → `stg.aadt` | DTP yearly AADT GeoJSON 2001–2019 | Used manually as the `aadt` parameter in `mvm_predict.py` |

**The RADAR description text** carries structured DTP wording that the model parses. For example:
> "Utility Works activities occurring between 28/10/2025 and 30/10/2025 during the following times: Weekdays 8:00 PM to 5:30 AM. Impact to traffic will be lanes closed northbound. Altered speed limit…"

Other things to know about RADAR:
- `lv_access` is **unreliable** as a "road closed" flag: it is 0 even for lane closures. It is not used.
- About half the Melbourne closures have no DTP wording, so they are "unspecified".

## 4. Pipeline steps and design decisions
1. **Closures (`01_closures_pairs.sql`)**
   - **Filters:** VIC; Greater Melbourne bbox (lat −38.2…−37.5, lon 144.5…145.5); categories Planned Roadworks, Unplanned Roadworks, Utilities / Construction, Planned Event; local dates overlapping 2024-01-01…2026-09-23; duration 0–7 days; street_name not null → 6,514 closures.
   - **`closure_type`** (from text): road closed / ramp closed / lanes closed / unspecified.
   - **`work_window`:**
     - `24 hours` if "12:00 AM to 12:00 AM";
     - `night` if the start is 7–11 PM and the end is AM, or 12 AM → 1–6 AM;
     - `day` if the start is 5–11 AM;
     - else `unspecified`.
   - **`street_key`:** the upper-cased street name, with the suburb suffix (" - X") and the road-type suffix removed.
2. **Pairs:** SCATS `site_type='INT'` within **200 m** (haversine), pre-filtered by a lat/lon box.
   - `same_street` = `street_key` (≥3 chars) appears in `site_name`; otherwise the site is a cross street.
   - Result: 4,477 pairs, 3,075 closures, 591 sites.
3. **Site bands (`02_site_band.sql`)**
   - Only matched sites; only **complete site-days** (24 hours, `max(n_missing_slots)=0`, volume>0).
   - Bands: AM peak 07–08h, Inter-peak 09–15h, PM peak 16–18h, Night 19–06h (by `hour_local`).
4. **Impact (`03_impact.sql`)**
   - For each closure × site × closure day (excluding public holidays) × band: **baseline** = median of the same site/band on d−7, −14 … −42.
   - Baseline days exclude public holidays and any day with **any** closure active within 200 m of that site (`mvm_site_closure_days`).
   - Keep rows where the baseline has ≥3 days and is >0.
   - `change = observed / baseline − 1`.
   - Result: 41,536 rows, 2,708 closures.
5. **Lookup (`04_lookup.sql`)**
   - Collapse to **one value per closure × band × site_relation** (the median over days and sites) so long closures don't dominate. `site_daily_volume` = median baseline daily volume.
   - **`road_class`:** low <20k, medium 20–40k, high >40k vehicles/day. These are intersection totals, all approaches.
   - **Levels:**
     1. closure_type × work_window × time_band × road_class;
     2. the same without road_class;
     3. time_band only.
   - Stats: n, P10, P50, P90, mean, share with change < −0.15. Only groups with **n ≥ 20** are kept.
   - Implemented as a table macro `mvm_build_lookup(train_before)`.
6. **Validation (`05_validation.sql`)**
   - The lookup is trained on closures with `d_from < 2026-01-01` and tested on 2026 closures.
   - The prediction is the most specific level available.
7. **Prediction (`mvm_predict.py`)**
   - Hourly demand = AADT × 0.5 (direction) × weekday hourly share.
   - During works, demand × (1 + P50) is the **typical** case and demand × (1 + P90) is the **worst** case (least traffic avoided the site).
   - Capacity = lanes_open × 800 × 0.85 when works are active, otherwise lanes_per_direction × 800.
   - Queue: `Q = max(0, Q_prev + D − C)`. Anything above 500 m/lane counts as **forced diversion**. Delay = Σ trapezoid of Q.
   - The loop starts at 05:00 so overnight works run continuously.
   - `$` only if `value_of_time_per_veh_h` is set; source it from ATAP and verify before quoting.
   - `compare_windows()` ranks night / day / 24 hours by worst-case delay.

## 5. Expected results (use these to check a rebuild)
- **Counts:** 6,514 closures; 4,477 pairs / 3,075 closures / 591 sites; site-band rows 2,221,240 (580 sites with complete days); impact rows 41,536 (2,708 closures).
- **Lookup:** 144 rows (level 1: 92, level 2: 44, level 3: 8). 11,528 per-closure rows.
- **Key lookup rows** (same street, level 1):
  - lanes closed / 24 hours / high: P50 −8% (AM), share >15% drop ≈ 0.38–0.45;
  - lanes closed / night / high, Night band: P10 −0.29, share 0.14 (daytime bands ≈ 0.07–0.09).
- **Validation, same street** (n = 2,864):
  - median abs error model 0.061 vs "no change" 0.058;
  - P10–P90 coverage 0.766.
- **Validation, cross street** (n = 1,858):
  - median abs error 0.051 vs 0.047;
  - coverage 0.757.
- **Risk bands, same street** (predicted → actual share with a >15% drop): <10% → 0.10; 10–20% → 0.146; 20–30% → 0.31; ≥30% → 0.434.
- **Example** (`python mvm_predict.py`): lanes closed, 2→1 lanes, AADT 40,000, site 4391 GRATTAN/SWANSTON (road class low).

  | Work window | Delay (typical) | Forced diversions (typical) | Worst case |
  |---|---|---|---|
  | Night | ≈12 veh-h | 0 | 132 veh-h |
  | Day | ≈429 veh-h | ~2,836 | — |
  | 24 hours | ≈1,022 veh-h | — | — |

## 6. How to rebuild
**Update, 30 Sep 2026:** the main build now runs from the raw files without the warehouse. In the Barrier Brain repo, run `python model/build_parquet.py`, then `python model/mvm/build_mvm.py`. It reproduces every output CSV to within floating-point rounding (1e-16). The warehouse route below still works.

Prerequisite: RADAR is loaded (`stg.radar_roadworks` exists). If not:
1. `pipeline\fetch_closures.bat` (downloads group `closures`);
2. then `pipeline\fetch_and_load_closures.bat` (download + `run_etl.py --from 55_closures`; close Tableau first).

```bat
cd "C:\Users\T\Documents\Subjects\FEIT Smart City Hackathon"
.venv\Scripts\python.exe analysis\mvm\run_mvm.py
.venv\Scripts\python.exe analysis\mvm\mvm_predict.py
```
The headline-stats CSVs used by `mvm_predict.py` are rebuilt with `analysis\headline_stats\run_query.py 01_scats_hourly_profile.sql` and `02_scats_site_daily.sql`.

## 7. Known limitations and next steps
- **Whole-intersection SCATS totals dilute approach-level effects.** Next step: detector-level (approach) volumes from the raw VSDATA files (`NB_DETECTOR`, V00–V95).
- **RADAR windows are indicative** (date ranges; works may not run every day). A change-point detection on hourly data would refine them.
- **The P50 point estimate doesn't beat "no change"** because most closures don't bite. Present the model as a risk/range estimator.
- **No equipment history.** Equipment (VMS, barriers, lighting) is a rules/scenario layer, not learned.
- **Queue parameters are assumptions:** 800 veh/h/lane, 0.85 work-zone factor, 500 m tolerable queue. They could be calibrated against Canberra `stg.act_route_stats` (5-min travel time/delay, 2020–23) with `stg.radar_roadworks_act` / `stg.act_ttm_closures`.
- **Open item:** `55_closures.sql` last statement (`stg.act_routes`) failed on a malformed geometry. It was patched (filter null type/coordinates) and needs a re-run (`run_etl.py --from 55_closures`). The MVM doesn't need it.
- **Related project docs** (claude.ai project "Smart City Hackathon", `data-pack/`): `07_challenge_brief.md`, `08_headline_stats.md`, `09_closure_impact_model.md` (full ambitious design), `10_minimum_viable_model.md`.

---

## 8. Full source code (verbatim at time of writing)

### `01_closures_pairs.sql`
```sql
-- MVM step 1+2: closures (RADAR, Greater Melbourne, <=7 days, 2024-01-01..2026-09-23) and signal sites within 200 m
-- Run inside analysis/mvm/mvm.duckdb with the warehouse attached read-only as w.
CREATE OR REPLACE TABLE mvm_closures AS
WITH c AS (
  SELECT radar_id, category_clean, street_name, side_street, end_side_street, description, lat, lon, lv_access, hv_access,
         ts_from, ts_to,
         CAST(timezone('Australia/Melbourne', ts_from) AS DATE) AS d_from,
         CAST(timezone('Australia/Melbourne', ts_to)   AS DATE) AS d_to
  FROM w.stg.radar_roadworks
  WHERE state = 'VIC' AND lat BETWEEN -38.2 AND -37.5 AND lon BETWEEN 144.5 AND 145.5
    AND category_clean IN ('Planned Roadworks','Unplanned Roadworks','Utilities / Construction','Planned Event')
    AND street_name IS NOT NULL
)
SELECT *,
  -- DTP planned-disruption text: "... during the following times: Weekdays 8:00 PM to 5:00 AM. Impact to traffic will be lanes closed both directions."
  CASE WHEN regexp_matches(lower(coalesce(description,'')), 'impact to traffic will be (road|carriageway) closed|road (is |will be )?closed|full (road )?closure|closed to (all )?traffic') THEN 'road closed'
       WHEN regexp_matches(lower(coalesce(description,'')), 'impact to traffic will be [^.]*ramp') THEN 'ramp closed'
       WHEN regexp_matches(lower(coalesce(description,'')), 'impact to traffic will be [^.]*lane') THEN 'lanes closed'
       ELSE 'unspecified' END AS closure_type,
  regexp_extract(description, 'Impact to traffic will be ([^.]*)', 1) AS impact_text,
  regexp_extract(description, 'during the following times: ([^.]*?)\. Impact', 1) AS work_times_text,
  CASE WHEN regexp_matches(coalesce(description,''), '(Weekdays|Weekends) 12:00 AM to 12:00 AM') THEN '24 hours'
       WHEN regexp_matches(coalesce(description,''), '(Weekdays|Weekends) ([7-9]|1[01]):[0-9]{2} PM to ([1-9]|1[0-2]):[0-9]{2} AM')
         OR regexp_matches(coalesce(description,''), '(Weekdays|Weekends) 12:[0-9]{2} AM to [1-6]:[0-9]{2} AM') THEN 'night'
       WHEN regexp_matches(coalesce(description,''), '(Weekdays|Weekends) ([5-9]|1[01]):[0-9]{2} AM to ([1-9]|1[0-2]):[0-9]{2} (AM|PM)') THEN 'day'
       ELSE 'unspecified' END AS work_window,
  trim(regexp_replace(regexp_replace(upper(street_name), '\s*-\s.*$', ''),
        '\s+(STREET|ST|ROAD|RD|AVENUE|AVE|AV|HIGHWAY|HWY|PARADE|PDE|DRIVE|DR|BOULEVARD|BVD|BLVD|LANE|LA|PLACE|PL|CRESCENT|CRES|WAY|FREEWAY|FWY|TERRACE|TCE|GROVE|GR|COURT|CT)\b.*$', '')) AS street_key
FROM c
WHERE d_to >= DATE '2024-01-01' AND d_from <= DATE '2026-09-23' AND d_to - d_from BETWEEN 0 AND 7;

CREATE OR REPLACE TABLE mvm_pairs AS
WITH p AS (
  SELECT c.radar_id, s.site_no, s.site_name,
         2*6371000*asin(sqrt(pow(sin(radians(s.lat-c.lat)/2),2) + cos(radians(c.lat))*cos(radians(s.lat))*pow(sin(radians(s.lon-c.lon)/2),2))) AS dist_m,
         length(c.street_key) >= 3 AND strpos(upper(s.site_name), c.street_key) > 0 AS same_street
  FROM mvm_closures c
  JOIN w.stg.scats_sites s ON s.site_type = 'INT' AND abs(s.lat - c.lat) < 0.002 AND abs(s.lon - c.lon) < 0.0025
)
SELECT * FROM p WHERE dist_m <= 200;
```

### `02_site_band.sql`
```sql
-- MVM step 3a: complete site-days for the matched signal sites, volume per time band
CREATE OR REPLACE TABLE mvm_site_band AS
WITH h AS (
  SELECT site_no, date_local, hour_local, volume, n_missing_slots
  FROM w.stg.scats_site_hour
  WHERE site_no IN (SELECT DISTINCT site_no FROM mvm_pairs)
),
ok AS (
  SELECT site_no, date_local, sum(volume) AS daily FROM h
  GROUP BY 1,2 HAVING count(*) = 24 AND max(n_missing_slots) = 0 AND sum(volume) > 0
)
SELECT h.site_no, h.date_local, ok.daily,
       CASE WHEN h.hour_local BETWEEN 7 AND 8 THEN 'AM peak' WHEN h.hour_local BETWEEN 9 AND 15 THEN 'Inter-peak'
            WHEN h.hour_local BETWEEN 16 AND 18 THEN 'PM peak' ELSE 'Night' END AS time_band,
       sum(h.volume) AS vol
FROM h JOIN ok USING (site_no, date_local)
GROUP BY ALL;
```

### `03_impact.sql`
```sql
-- MVM step 3b: observed band volume on each closure day vs median of the same site/band/weekday over the previous 6 weeks.
-- Baseline weeks exclude public holidays and days when any closure was active within 200 m of that site.
CREATE OR REPLACE TABLE mvm_site_closure_days AS
SELECT DISTINCT p.site_no, unnest(generate_series(c.d_from, c.d_to, INTERVAL 1 DAY))::DATE AS d
FROM mvm_pairs p JOIN mvm_closures c USING (radar_id);

CREATE OR REPLACE TABLE mvm_impact AS
WITH days AS (
  SELECT p.radar_id, p.site_no, p.same_street, p.dist_m,
         unnest(generate_series(c.d_from, c.d_to, INTERVAL 1 DAY))::DATE AS d
  FROM mvm_pairs p JOIN mvm_closures c USING (radar_id)
),
obs AS (
  SELECT d.*, b.time_band, b.vol AS observed, b.daily AS observed_daily
  FROM days d
  JOIN mvm_site_band b ON b.site_no = d.site_no AND b.date_local = d.d
  JOIN w.main.dim_date k ON k.date_local = d.d
  WHERE NOT k.is_public_holiday
),
base AS (
  SELECT o.radar_id, o.site_no, o.d, o.time_band,
         median(b.vol) AS baseline, median(b.daily) AS baseline_daily, count(*) AS n_base
  FROM obs o
  JOIN mvm_site_band b ON b.site_no = o.site_no AND b.time_band = o.time_band
   AND b.date_local IN (o.d - 7, o.d - 14, o.d - 21, o.d - 28, o.d - 35, o.d - 42)
  JOIN w.main.dim_date k ON k.date_local = b.date_local AND NOT k.is_public_holiday
  WHERE NOT EXISTS (SELECT 1 FROM mvm_site_closure_days x WHERE x.site_no = b.site_no AND x.d = b.date_local)
  GROUP BY ALL
)
SELECT o.*, base.baseline, base.baseline_daily, base.n_base,
       o.observed / nullif(base.baseline, 0) - 1 AS change
FROM obs o JOIN base USING (radar_id, site_no, d, time_band)
WHERE base.n_base >= 3 AND base.baseline > 0;
```

### `04_lookup.sql`
```sql
-- MVM step 4: the lookup table (the model). One value per closure first, so long closures don't dominate.
-- level 1 = closure_type x work_window x time_band x road_class ; level 2 = without road_class ; level 3 = time_band only.
-- Parameter: training period (default = all closures). Validation re-runs this with d_from < 2026-01-01.
CREATE OR REPLACE TABLE mvm_per_closure AS
SELECT i.radar_id, c.closure_type, c.work_window, i.time_band,
       CASE WHEN i.same_street THEN 'same street' ELSE 'cross street' END AS site_relation,
       c.d_from,
       median(i.change) AS change,
       median(i.baseline_daily) AS site_daily_volume,
       count(DISTINCT i.d) AS n_days, count(DISTINCT i.site_no) AS n_sites
FROM mvm_impact i JOIN mvm_closures c USING (radar_id)
GROUP BY ALL;

CREATE OR REPLACE MACRO mvm_road_class(v) AS
  CASE WHEN v < 20000 THEN 'low (<20k/day)' WHEN v < 40000 THEN 'medium (20-40k/day)' ELSE 'high (>40k/day)' END;

CREATE OR REPLACE MACRO mvm_build_lookup(train_before) AS TABLE
WITH pc AS (SELECT *, mvm_road_class(site_daily_volume) AS road_class FROM mvm_per_closure WHERE d_from < train_before),
g AS (
  SELECT 1 AS level, site_relation, closure_type, work_window, time_band, road_class, change FROM pc
  UNION ALL SELECT 2, site_relation, closure_type, work_window, time_band, 'any', change FROM pc
  UNION ALL SELECT 3, site_relation, 'any', 'any', time_band, 'any', change FROM pc
)
SELECT level, site_relation, closure_type, work_window, time_band, road_class,
       count(*) AS n_closures,
       quantile_cont(change, 0.1) AS p10, quantile_cont(change, 0.5) AS p50, quantile_cont(change, 0.9) AS p90,
       avg(change) AS mean_change,
       avg((change < -0.15)::INT) AS share_over_15pct_drop
FROM g GROUP BY ALL HAVING count(*) >= 20;

CREATE OR REPLACE TABLE mvm_lookup AS SELECT * FROM mvm_build_lookup(DATE '2100-01-01');
```

### `05_validation.sql`
```sql
-- MVM validation: build the lookup from closures starting before 2026, predict closures starting in 2026.
-- Prediction = most specific lookup level with >= 20 closures. Compared with a naive "no change" prediction.
CREATE OR REPLACE TABLE mvm_lookup_train AS SELECT * FROM mvm_build_lookup(DATE '2026-01-01');

CREATE OR REPLACE TABLE mvm_validation AS
WITH test AS (SELECT *, mvm_road_class(site_daily_volume) AS road_class FROM mvm_per_closure WHERE d_from >= DATE '2026-01-01'),
cand AS (
  SELECT t.radar_id, t.site_relation, t.time_band, t.change AS actual, l.level, l.p10, l.p50, l.p90, l.n_closures,
         row_number() OVER (PARTITION BY t.radar_id, t.site_relation, t.time_band ORDER BY l.level) AS rk
  FROM test t JOIN mvm_lookup_train l
    ON l.site_relation = t.site_relation AND l.time_band = t.time_band
   AND ((l.level = 1 AND l.closure_type = t.closure_type AND l.work_window = t.work_window AND l.road_class = t.road_class)
     OR (l.level = 2 AND l.closure_type = t.closure_type AND l.work_window = t.work_window)
     OR  l.level = 3)
)
SELECT * EXCLUDE (rk) FROM cand WHERE rk = 1;

CREATE OR REPLACE VIEW mvm_validation_summary AS
SELECT site_relation, count(*) AS n_test,
       median(abs(actual - p50)) AS mae_model, median(abs(actual)) AS mae_no_change,
       avg(abs(actual - p50)) AS mean_abs_err_model, avg(abs(actual)) AS mean_abs_err_no_change,
       avg((actual BETWEEN p10 AND p90)::INT) AS p10_p90_coverage,
       avg((level = 1)::INT) AS share_level1
FROM mvm_validation GROUP BY 1;
```

### `run_mvm.py`
```python
"""Build the minimum viable closure-impact model (MVM) from the warehouse (opened read-only).
    python analysis/mvm/run_mvm.py            (from the project folder; ~1 min)
Writes a scratch DuckDB (analysis/mvm/mvm.duckdb, or $MVM_WORKDB) and CSVs in analysis/mvm/output/.
Steps: 01 closures + site pairs, 02 site x day x time-band volumes, 03 impact vs 6-week baseline,
       04 lookup table (the model), 05 validation (train < 2026, test 2026)."""
import os, pathlib, time, duckdb
HERE = pathlib.Path(__file__).resolve().parent
WAREHOUSE = HERE.parent.parent / "warehouse" / "city.duckdb"
WORK = pathlib.Path(os.environ.get("MVM_WORKDB", HERE / "mvm.duckdb"))
OUT = HERE / "output"; OUT.mkdir(exist_ok=True)

con = duckdb.connect(str(WORK))
con.sql(f"ATTACH '{WAREHOUSE.as_posix()}' AS w (READ_ONLY)")
for f in ["01_closures_pairs.sql", "02_site_band.sql", "03_impact.sql", "04_lookup.sql", "05_validation.sql"]:
    t = time.time(); con.sql((HERE / f).read_text(encoding="utf-8")); print(f"{f}: {time.time()-t:.1f}s")

exports = {
    "mvm_lookup": "SELECT * FROM mvm_lookup ORDER BY level, site_relation, closure_type, work_window, road_class, time_band",
    "mvm_per_closure": """SELECT p.*, c.street_name, c.side_street, c.category_clean, c.d_to, c.lat, c.lon, c.impact_text, c.work_times_text
                          FROM mvm_per_closure p JOIN mvm_closures c USING (radar_id)""",
    "mvm_validation_summary": "SELECT * FROM mvm_validation_summary",
    "mvm_validation_risk_bands": """
        WITH v AS (SELECT v.*, l.share_over_15pct_drop AS predicted_risk FROM mvm_validation v
                   JOIN mvm_lookup_train l ON l.level = v.level AND l.site_relation = v.site_relation AND l.time_band = v.time_band
                    AND l.p50 = v.p50 AND l.p10 = v.p10 AND l.n_closures = v.n_closures)
        SELECT site_relation,
               CASE WHEN predicted_risk < 0.1 THEN '1: <10%' WHEN predicted_risk < 0.2 THEN '2: 10-20%'
                    WHEN predicted_risk < 0.3 THEN '3: 20-30%' ELSE '4: >=30%' END AS predicted_risk_band,
               count(*) AS n_test, avg(predicted_risk) AS predicted_share_over_15pct_drop,
               avg((actual < -0.15)::INT) AS actual_share_over_15pct_drop
        FROM v GROUP BY ALL ORDER BY 1, 2""",
}
for name, q in exports.items():
    con.sql(q).df().to_csv(OUT / f"{name}.csv", index=False)
    print("wrote", f"output/{name}.csv")
```

### `mvm_predict.py`
```python
"""Minimum viable closure-impact model: lookup (learned from ~2,700 past Melbourne closures) + hour-by-hour queue.

    from mvm_predict import predict, compare_windows
    r = predict(closure_type="lanes closed", work_window="night", aadt=40000, lanes_per_direction=2, lanes_open=1,
                site_no=4391)                      # site_no (nearest signal) sets the road class; or pass road_class=
    print(r["summary"]); print(r["hourly"])
    print(compare_windows("lanes closed", aadt=40000, lanes_per_direction=2, lanes_open=1, site_no=4391))

Inputs
  closure_type : 'lanes closed' | 'ramp closed' | 'unspecified'   (as in the RADAR/DTP text)
  work_window  : 'night' (20:00-05:00) | 'day' (09:00-15:00) | '24 hours'
  aadt         : two-way daily traffic on the closed road (e.g. from stg.aadt), one direction assumed = 50 %
  lanes_per_direction, lanes_open : lanes in the affected direction, and lanes left open while works are active
Assumptions (all overridable, state them on the slide)
  capacity_per_lane = 800 veh/h (signalised arterial ~1,800 veh/h of green x ~45 % green)
  work_zone_factor  = 0.85 (capacity of open lanes next to works)
  max_queue_m_per_lane = 500 (queue drivers tolerate; vehicles beyond it are counted as forced diversions)
  value_of_time_per_veh_h = None (set from ATAP guidance to get $; left blank until verified)
Output: expected change in traffic (P10/P50/P90 from the lookup, with n past closures), vehicle-hours of delay,
        max queue length (m) and queue duration, for P50 and for the P10 (worse-case: less diversion) scenario."""
import pathlib
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
LOOKUP = pd.read_csv(HERE / "output" / "mvm_lookup.csv")
PROFILE = pd.read_csv(HERE.parent / "headline_stats" / "output" / "01_scats_hourly_profile.csv")
SITES = pd.read_csv(HERE.parent / "headline_stats" / "output" / "02_scats_site_daily.csv")

WINDOWS = {"night": list(range(20, 24)) + list(range(0, 5)), "day": list(range(9, 15)), "24 hours": list(range(24))}
BAND = {h: ("AM peak" if 7 <= h <= 8 else "Inter-peak" if 9 <= h <= 15 else "PM peak" if 16 <= h <= 18 else "Night")
        for h in range(24)}


def road_class_from_volume(v):
    return "low (<20k/day)" if v < 20000 else "medium (20-40k/day)" if v < 40000 else "high (>40k/day)"


def lookup(closure_type, work_window, time_band, road_class, site_relation="same street"):
    """most specific lookup row with >= 20 past closures (level 1 -> 2 -> 3)"""
    L = LOOKUP[(LOOKUP.site_relation == site_relation) & (LOOKUP.time_band == time_band)]
    for lvl, cond in [(1, (L.closure_type == closure_type) & (L.work_window == work_window) & (L.road_class == road_class)),
                      (2, (L.closure_type == closure_type) & (L.work_window == work_window)),
                      (3, L.level == 3)]:
        hit = L[(L.level == lvl) & cond]
        if len(hit):
            return hit.iloc[0].to_dict()
    raise ValueError("no lookup row")


def predict(closure_type="lanes closed", work_window="night", aadt=30000, lanes_per_direction=2, lanes_open=1,
            site_no=None, road_class=None, day_type="Weekday", direction_split=0.5,
            capacity_per_lane=800, work_zone_factor=0.85, value_of_time_per_veh_h=None, veh_length_m=7.0,
            max_queue_m_per_lane=500):
    if road_class is None:
        if site_no is None:
            raise ValueError("give site_no (nearest signalised intersection) or road_class")
        s = SITES[(SITES.site_no == site_no) & (SITES.day_type == "Weekday")]
        road_class = road_class_from_volume(float(s.avg_daily_vehicles.iloc[0])) if len(s) else "medium (20-40k/day)"
    prof = PROFILE[PROFILE.day_type == day_type].set_index("hour_local").share_of_day
    active = set(WINDOWS[work_window])
    max_queue_veh = max_queue_m_per_lane / veh_length_m * max(lanes_open, 1)
    rows, q = [], {"typical": 0.0, "worst": 0.0}
    for h in list(range(5, 24)) + list(range(0, 5)):          # start at 05:00 so overnight works run continuously
        band = BAND[h]
        lk = lookup(closure_type, work_window, band, road_class)
        demand = aadt * direction_split * float(prof.get(h, 0))
        works = h in active
        cap = (lanes_open * capacity_per_lane * work_zone_factor) if works else lanes_per_direction * capacity_per_lane
        row = {"hour": h, "time_band": band, "works_active": works, "base_demand_veh_h": round(demand),
               "capacity_veh_h": round(cap), "lookup_level": int(lk["level"]), "n_past_closures": int(lk["n_closures"])}
        # typical = P50 traffic change from past closures; worst = P90 (least traffic avoided the site)
        for sc, change in [("typical", lk["p50"]), ("worst", lk["p90"])]:
            d = demand * (1 + (change if works else 0.0))
            q_prev = q[sc]
            q_new = max(0.0, q_prev + d - cap)
            forced = max(0.0, q_new - max_queue_veh)                # beyond the tolerable queue, drivers divert
            q[sc] = q_new - forced
            row[f"demand_{sc}"] = round(d); row[f"queue_veh_{sc}"] = round(q[sc])
            row[f"forced_diversion_veh_{sc}"] = round(forced); row[f"delay_veh_h_{sc}"] = (q_prev + q[sc]) / 2
        rows.append(row)
    hourly = pd.DataFrame(rows)
    lk_w = lookup(closure_type, work_window, "Night" if work_window == "night" else "Inter-peak", road_class)
    summ = {"closure_type": closure_type, "work_window": work_window, "road_class": road_class,
            "traffic_change_typical": lk_w["p50"], "traffic_change_range": (lk_w["p10"], lk_w["p90"]),
            "chance_of_over_15pct_drop": lk_w["share_over_15pct_drop"], "based_on_n_past_closures": int(lk_w["n_closures"]),
            "lookup_level": int(lk_w["level"])}
    for sc in ["typical", "worst"]:
        delay = hourly[f"delay_veh_h_{sc}"].sum()
        summ[f"delay_veh_h_{sc}"] = round(delay, 1)
        summ[f"max_queue_m_{sc}"] = round(hourly[f"queue_veh_{sc}"].max() * veh_length_m / max(lanes_open, 1))
        summ[f"queue_hours_{sc}"] = int((hourly[f"queue_veh_{sc}"] > 0).sum())
        summ[f"forced_diversions_veh_{sc}"] = int(hourly[f"forced_diversion_veh_{sc}"].sum())
        if value_of_time_per_veh_h:
            summ[f"delay_cost_{sc}"] = round(delay * value_of_time_per_veh_h)
    return {"summary": summ, "hourly": hourly}


def compare_windows(closure_type="lanes closed", **kw):
    out = []
    for w in ["night", "day", "24 hours"]:
        s = predict(closure_type=closure_type, work_window=w, **kw)["summary"]
        out.append({k: s[k] for k in s if k not in ("traffic_change_range",)})
    df = pd.DataFrame(out).sort_values("delay_veh_h_worst")
    df["recommended"] = df.index == df.index[0]
    return df


if __name__ == "__main__":
    pd.set_option("display.width", 200)
    print(compare_windows("lanes closed", aadt=40000, lanes_per_direction=2, lanes_open=1, site_no=4391).to_string(index=False))
```

### `pipeline/sql/55_closures.sql` (loads RADAR + ACT data into the warehouse)
```sql
-- requires: radar_roadworks_vic
-- optional: true
-- Road closures / roadworks history.
--  * RADAR (DITRDCSA National Freight Data Hub): harmonised national roadworks + closures from daily state feeds,
--    captured since Sep 2020. VIC records -> dim_entity (point) + fact_event; ACT records -> stg only.
--  * Roads ACT TTM planned closures 2018-2020 and ACT route travel-time stats 2020-2023 -> stg (Canberra calibration).
-- Dates in RADAR are epoch milliseconds (UTC).

CREATE OR REPLACE MACRO radar_ts(ms) AS CASE WHEN ms IS NOT NULL THEN to_timestamp(ms::DOUBLE / 1000) END;

CREATE OR REPLACE TABLE stg.radar_roadworks AS
WITH j AS (
    SELECT unnest(features) AS f
    FROM read_json('{ds:radar_roadworks_vic}/*.geojson', maximum_object_size=100000000, union_by_name=true)
)
SELECT f.properties.id::BIGINT                         AS radar_id,
       f.properties.unique_identifier                  AS source_id,
       f.properties.state                              AS state,
       f.properties.status                             AS status,
       f.properties.category                           AS category,
       f.properties.updated_category                   AS category_clean,
       f.properties."type"                             AS event_type_raw,
       radar_ts(f.properties.from_date)                AS ts_from,
       radar_ts(f.properties.to_date)                  AS ts_to,
       radar_ts(f.properties.planned_start_date)       AS ts_planned_start,
       radar_ts(f.properties.planned_end_date)         AS ts_planned_end,
       radar_ts(f.properties.modified_date)            AS ts_modified,
       radar_ts(f.properties.capture_date)             AS ts_captured,
       f.properties.description                        AS description,
       f.properties.street_name                        AS street_name,
       f.properties.side_street                        AS side_street,
       f.properties.end_side_street                    AS end_side_street,
       f.properties.direction                          AS direction,
       f.properties.lv_access::SMALLINT                AS lv_access,
       f.properties.hv_access::SMALLINT                AS hv_access,
       f.properties.source_url                         AS source_url,
       (f.geometry.coordinates)[2]::DOUBLE             AS lat,
       (f.geometry.coordinates)[1]::DOUBLE             AS lon
FROM j
WHERE f.geometry IS NOT NULL;

DELETE FROM dim_entity WHERE source = 'radar';
INSERT INTO dim_entity (entity_uid, source, native_id, entity_type, name, lat, lon, attrs)
SELECT 'radar:' || radar_id, 'radar', source_id, 'work_zone',
       coalesce(street_name, '') || coalesce(' / ' || side_street, '') || coalesce(' to ' || end_side_street, ''),
       lat, lon,
       to_json({category: category_clean, street: street_name, side_street: side_street, end_side_street: end_side_street,
                direction: direction})
FROM stg.radar_roadworks
WHERE state = 'VIC' AND lat BETWEEN -39.5 AND -33.5 AND lon BETWEEN 140.5 AND 150.5;

DELETE FROM fact_event WHERE event_type = 'roadworks';
INSERT INTO fact_event
SELECT 'radar:' || radar_id, 'roadworks', 'radar:' || radar_id, NULL, NULL,
       ts_from, ts_to, category_clean,
       CASE WHEN lv_access = 0 THEN 1 ELSE 3 END,          -- 1 = closed to light vehicles, 3 = open / partial
       to_json({status: status, category_raw: category, type: event_type_raw, description: description,
                street_name: street_name, side_street: side_street, end_side_street: end_side_street,
                direction: direction, lv_access: lv_access, hv_access: hv_access,
                planned_start: ts_planned_start, planned_end: ts_planned_end,
                modified: ts_modified, captured: ts_captured, source_id: source_id})
FROM stg.radar_roadworks
WHERE state = 'VIC' AND lat BETWEEN -39.5 AND -33.5 AND lon BETWEEN 140.5 AND 150.5;

-- ACT (Canberra) calibration data: kept in staging only (outside the Victorian geography spine)
CREATE OR REPLACE TABLE stg.radar_roadworks_act AS
WITH j AS (
    SELECT unnest(features) AS f
    FROM read_json('{ds:radar_roadworks_act}/*.geojson', maximum_object_size=100000000, union_by_name=true)
)
SELECT f.properties.id::BIGINT AS radar_id, f.properties.unique_identifier AS source_id,
       f.properties.updated_category AS category_clean, f.properties."type" AS event_type_raw,
       radar_ts(f.properties.from_date) AS ts_from, radar_ts(f.properties.to_date) AS ts_to,
       radar_ts(f.properties.capture_date) AS ts_captured, f.properties.description AS description,
       f.properties.street_name AS street_name, f.properties.side_street AS side_street,
       f.properties.end_side_street AS end_side_street, f.properties.lv_access::SMALLINT AS lv_access,
       (f.geometry.coordinates)[2]::DOUBLE AS lat, (f.geometry.coordinates)[1]::DOUBLE AS lon
FROM j WHERE f.geometry IS NOT NULL;

-- Roads ACT TTM planned closures 2018-2020. NB: source columns "Roads Closed" and "Reason for Closure" are swapped.
CREATE OR REPLACE TABLE stg.act_ttm_closures AS
SELECT "Object ID" AS object_id, "Closure Type" AS closure_type,
       "Reason for Closure" AS roads_closed,          -- swapped at source
       "Roads Closed" AS reason,                      -- swapped at source
       "Closure Description" AS description, "Project Title" AS project_title, "Related Suburbs" AS suburbs,
       try_strptime("Closure Start Time", '%m/%d/%Y %I:%M:%S %p') AT TIME ZONE 'Australia/Canberra' AS ts_start,
       try_strptime("Closure End Time", '%m/%d/%Y %I:%M:%S %p') AT TIME ZONE 'Australia/Canberra' AS ts_end,
       try_cast(regexp_extract("Location", 'POINT \(([-0-9.]+) ([-0-9.]+)\)', 2) AS DOUBLE) AS lat,
       try_cast(regexp_extract("Location", 'POINT \(([-0-9.]+) ([-0-9.]+)\)', 1) AS DOUBLE) AS lon
FROM read_csv('{ds:act_ttm_closures}/*.csv', header=true, all_varchar=true);

-- Roads ACT route travel times (5-min), 2020-2023
CREATE OR REPLACE TABLE stg.act_route_stats AS
SELECT id::INT AS route_id, name AS route_name, primaryroadname AS primary_road, startenddescription AS start_end,
       intervalstart::TIMESTAMPTZ AS ts_start, try_cast(tt AS DOUBLE) AS travel_time_s, try_cast(delay AS DOUBLE) AS delay_s,
       try_cast(excessdelay AS DOUBLE) AS excess_delay_s, try_cast(speed AS DOUBLE) AS speed_kmh,
       try_cast(length AS DOUBLE) AS length_m, datastatus AS data_status
FROM read_csv('{ds:act_route_stats}/*.csv', header=true, all_varchar=true);

-- route geometry: one line per route id (latest available snapshot)
CREATE OR REPLACE TABLE stg.act_routes AS
WITH j AS (
    SELECT unnest(features) AS f, '3_2023' AS filename
    FROM read_json('{ds:act_route_geometry}/*.geojson', maximum_object_size=200000000)
    UNION ALL
    SELECT unnest(features), '2_2022' FROM read_json('{ds:act_route_geometry_2022_v2}/*.geojson', maximum_object_size=200000000)
    UNION ALL
    SELECT unnest(features), '1_2020' FROM read_json('{ds:act_route_geometry_2020_v2}/*.geojson', maximum_object_size=200000000)
)
SELECT f.properties.id::INT AS route_id, arg_max(f.properties.name, filename) AS route_name,
       arg_max(ST_GeomFromGeoJSON(to_json(f.geometry)), filename) AS geom
FROM j WHERE f.geometry IS NOT NULL AND f.geometry.type IS NOT NULL AND f.geometry.coordinates IS NOT NULL GROUP BY 1;
```
