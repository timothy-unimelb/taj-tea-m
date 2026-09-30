# Closure-impact model

This folder holds the impact model for Barrier Brain. It estimates how a planned road closure changes traffic, delay and queues.

It was built by Tamara in a separate folder on 29 Sep 2026 and copied here as is.

## How it works

It has two parts. Neither uses machine learning.

1. **A lookup table learned from past closures.** About 2,700 past Melbourne closures from RADAR (the national roadworks feed) are matched to SCATS traffic signal counts within 200 m. For each closure, traffic is compared with the same site on the same weekday over the 6 weeks before. The results are grouped by closure type, work hours, time of day and road size.
2. **An hour-by-hour queue.** Traffic demand for each hour is compared with the lanes left open. That gives delay, queue length, and how many drivers are forced to divert.

`mvm/README.md` explains each step. `mvm/REPLICATION_CONTEXT.md` has the full detail, the checks and the known limits.

## What is in the repo

| Path | What it is |
|---|---|
| `mvm/mvm_predict.py` | Runs a prediction. Needs Python and pandas only. |
| `mvm/output/mvm_lookup.csv` | The model: the lookup table (144 rows). |
| `mvm/output/mvm_per_closure.csv` | Each past closure with its measured traffic change and location. |
| `mvm/output/mvm_validation_*.csv` | How well the model predicted 2026 closures when trained on earlier ones. |
| `headline_stats/output/` | Hourly traffic profile and daily volume per signal site. The prediction reads these. |
| `mvm/build_mvm.py` | Rebuilds the four `mvm/output/` CSVs from the flat parquet. This is the main build. |
| `mvm/0*.sql`, `mvm/run_mvm.py`, `headline_stats/` | The original build from the local warehouse. Kept for reference, and still the only way to rebuild `headline_stats/output/`. |
| `build_parquet.py` | Joins the raw files behind the model into one flat parquet table. See below. |

## In the app

The app does not run this Python. It runs a TypeScript port of `mvm_predict.py` live (`lib/impact/models/mvm-core.ts`), plus a SUMO simulation for the Swanston sample (`sumo/`). Both return the same result shape, described in `IMPACT_CONTRACT.md`.

| Path | What it is |
|---|---|
| `IMPACT_CONTRACT.md` | The input and output shape every impact model uses, and the severity rule |
| `export_app_tables.py` | Copies the three CSVs the model reads into `data/impact/mvm-tables.json` for the app. Rerun after the CSVs change |
| `check_ts_port.ts` | Checks the TypeScript port against this Python: `node_modules/.bin/jiti model/check_ts_port.ts` |
| `sumo/` | SUMO simulation of the Swanston closure. Early result. Read its README first |

## Running it

```bash
cd model/mvm
python mvm_predict.py
```

This compares night, day and 24-hour works for a sample lane closure and marks the best window.

## What is not in the repo

The raw downloads (about 41 GB) and Tamara's local data warehouse (`warehouse/city.duckdb`, about 5 GB) are too big for git. The model is built in two steps from the raw files, without the warehouse:

1. `python model/build_parquet.py` joins the raw files into one parquet (about 5 minutes).
2. `python model/mvm/build_mvm.py` builds the lookup and validation CSVs from it (about 15 seconds).

The CSVs are committed, so predictions work without either step. Paths in `REPLICATION_CONTEXT.md` point to Tamara's local folder.

## Flat dataset (parquet)

`build_parquet.py` reads the raw downloads directly with pandas, without the warehouse. It writes one compressed file, `parquet/closure_site_hour.parquet`, in the local data folder. The file is too big for git.

One row is one closure, one signal site within 200 m, one day and one hour. Each closure's rows start 6 weeks before it, so its baseline weeks come with it. Columns cover:

- **Traffic:** hourly SCATS count for the site, daily total, whether the site-day is complete, and whether another closure was active near the site that day.
- **Closure:** type, work hours, street, dates and the DTP text, parsed as in `mvm/01_closures_pairs.sql`.
- **Site:** name, location, distance to the closure, and whether it is on the same street.
- **Road:** AADT of the nearest road segment within 100 m. Many segments cover one direction only, so check `aadt_directions`.
- **Calendar:** weekday, weekend and Victorian public holidays.

```bash
python model/build_parquet.py --root "C:/Users/T/Documents/Subjects/FEIT Smart City Hackathon"
```

It takes about 5 minutes and needs pandas, numpy, pyarrow and pyproj (`pip install pandas pyarrow pyproj`). The raw files are only read.

## Limits to state in the pitch

- SCATS counts are totals for a whole intersection. A closure on one approach is diluted, so measured drops understate the effect on that approach.
- The typical estimate does not beat "assume no change", because most closures barely affect traffic. Present it as a range and a risk of a big drop, not a single number.
- Queue settings are assumptions: 800 vehicles per hour per lane, 0.85 capacity beside works, 500 m queue before drivers divert.
