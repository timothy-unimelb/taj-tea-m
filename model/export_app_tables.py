"""Copy the three tables the impact model reads into one JSON file for the app.

The app's TypeScript port of mvm/mvm_predict.py (lib/impact/models/mvm.ts) reads
data/impact/mvm-tables.json. Rerun this after the model CSVs change:

    cd model && .venv/bin/python export_app_tables.py
"""
import json
import pathlib
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "data" / "impact" / "mvm-tables.json"

lookup = pd.read_csv(HERE / "mvm" / "output" / "mvm_lookup.csv")
profile = pd.read_csv(HERE / "headline_stats" / "output" / "01_scats_hourly_profile.csv")
sites = pd.read_csv(HERE / "headline_stats" / "output" / "02_scats_site_daily.csv")

weekday = profile[profile.day_type == "Weekday"].set_index("hour_local").share_of_day
sites = sites[sites.day_type == "Weekday"]

tables = {
    "source": "Exported from model/ CSVs by model/export_app_tables.py. Do not edit by hand.",
    "lookup": [
        {k: (None if pd.isna(v) else v) for k, v in row.items()}
        for row in lookup.to_dict("records")
    ],
    "weekday_hourly_share": [float(weekday.get(h, 0)) for h in range(24)],
    # [site_no, name, lat, lon, average weekday vehicles]
    "sites": [
        [int(r.site_no), r.site_name if isinstance(r.site_name, str) else "",
         None if pd.isna(r.lat) else round(float(r.lat), 5),
         None if pd.isna(r.lon) else round(float(r.lon), 5),
         round(float(r.avg_daily_vehicles))]
        for r in sites.itertuples()
    ],
}
# One record per line, so diffs stay readable and line-based tools stay fast.
lines = ['{"source":' + json.dumps(tables["source"]) + ',',
         '"weekday_hourly_share":' + json.dumps(tables["weekday_hourly_share"]) + ',',
         '"lookup":[', ",\n".join(json.dumps(r, separators=(",", ":")) for r in tables["lookup"]), '],',
         '"sites":[', ",\n".join(json.dumps(r, separators=(",", ":")) for r in tables["sites"]), ']}']
OUT.write_text("\n".join(lines) + "\n")
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): {len(tables['lookup'])} lookup rows, {len(tables['sites'])} sites")
