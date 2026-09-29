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
| `mvm/0*.sql`, `mvm/run_mvm.py`, `headline_stats/` | Code that rebuilds the tables above. |

## Running it

```bash
cd model/mvm
python mvm_predict.py
```

This compares night, day and 24-hour works for a sample lane closure and marks the best window.

## What is not in the repo

The rebuild code needs Tamara's local data warehouse (`warehouse/city.duckdb`, about 5 GB, built from about 41 GB of raw downloads). It is too big for git. The CSVs here are its outputs, so predictions work without it. Paths in `REPLICATION_CONTEXT.md` point to that local folder.

## Limits to state in the pitch

- SCATS counts are totals for a whole intersection. A closure on one approach is diluted, so measured drops understate the effect on that approach.
- The typical estimate does not beat "assume no change", because most closures barely affect traffic. Present it as a range and a risk of a big drop, not a single number.
- Queue settings are assumptions: 800 vehicles per hour per lane, 0.85 capacity beside works, 500 m queue before drivers divert.
