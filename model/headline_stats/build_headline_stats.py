"""Build the two SCATS traffic tables the prediction, the app and the SUMO work read, straight from the raw files.

    python model/headline_stats/build_headline_stats.py      # ~7 min; writes output/01_*.csv and output/02_*.csv
    python model/headline_stats/build_headline_stats.py --root "D:/data/FEIT Smart City Hackathon" --workers 8

Period: 12 months, 1 Sep 2025 to 31 Aug 2026, every signal site. Only complete site-days are used:
24 hours, no missing 15-minute slots, and more than 0 vehicles.
  01_scats_hourly_profile.csv  one row per day type x hour: vehicles, days, sites, share of the day's traffic
  02_scats_site_daily.csv      one row per site x day type: days, average and median vehicles per day
Day types: Weekday, Saturday, Sunday, Public holiday. Reuses the readers in model/build_parquet.py."""
import argparse, pathlib, sys

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_parquet as bp                                         # noqa: E402

START, END = pd.Timestamp("2025-09-01"), pd.Timestamp("2026-08-31")
MONTHS = [f"{m.strftime('%B').lower()}_{m.year}" for m in pd.date_range(START, END, freq="MS")]


def day_types(dates):
    hol = set(pd.to_datetime(bp.vic_public_holidays().date_local))
    d = pd.to_datetime(pd.Series(dates))
    return pd.Series(["Public holiday" if x in hol else "Saturday" if x.dayofweek == 5 else
                      "Sunday" if x.dayofweek == 6 else "Weekday" for x in d], index=d.index)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=r"C:\Users\T\Documents\Subjects\FEIT Smart City Hackathon",
                    help="folder that holds raw/")
    ap.add_argument("--workers", type=int, default=12, help="processes reading SCATS zips (about 1 GB RAM each)")
    a = ap.parse_args()
    raw = pathlib.Path(a.root) / "raw"

    sh = bp.load_scats(raw, None, a.workers, months_wanted=MONTHS)
    sh["date_local"] = pd.to_datetime(sh.date_local)
    sh = sh[sh.date_local.between(START, END)]
    bp.log(f"site-hours: {len(sh):,}")

    day = (sh.groupby(["site_no", "date_local"])
             .agg(n_hours=("hour_local", "size"), daily_vehicles=("volume", "sum"),
                  max_missing=("n_missing_slots", "max"))
             .reset_index())
    day = day[(day.n_hours == 24) & (day.max_missing == 0) & (day.daily_vehicles > 0)]
    dates = day.date_local.drop_duplicates()
    day = day.merge(pd.DataFrame({"date_local": dates.values, "day_type": day_types(dates.values).values}),
                    on="date_local")
    bp.log(f"complete site-days: {len(day):,}")

    h = sh.merge(day[["site_no", "date_local", "day_type"]], on=["site_no", "date_local"])
    prof = (h.groupby(["day_type", "hour_local"])
              .agg(vehicles=("volume", "sum"), n_days=("date_local", "nunique"), n_sites=("site_no", "nunique"))
              .reset_index())
    prof["share_of_day"] = prof.vehicles / prof.groupby("day_type").vehicles.transform("sum")
    prof.sort_values(["day_type", "hour_local"]).to_csv(HERE / "output" / "01_scats_hourly_profile.csv", index=False)

    sites = bp.load_sites(raw).rename(columns={"site_lat": "lat", "site_lon": "lon"})
    daily = (day.groupby(["site_no", "day_type"])
                .agg(n_days=("daily_vehicles", "size"), avg_daily_vehicles=("daily_vehicles", "mean"),
                     median_daily_vehicles=("daily_vehicles", "median"))
                .reset_index()
                .merge(sites[["site_no", "site_name", "site_type", "lat", "lon"]], on="site_no", how="left"))
    daily = daily[["site_no", "site_name", "site_type", "lat", "lon", "day_type", "n_days", "avg_daily_vehicles",
                   "median_daily_vehicles"]]
    daily.sort_values(["avg_daily_vehicles", "site_no", "day_type"], ascending=[False, True, True]) \
         .to_csv(HERE / "output" / "02_scats_site_daily.csv", index=False)
    bp.log(f"wrote output/01_scats_hourly_profile.csv ({len(prof)} rows), "
           f"output/02_scats_site_daily.csv ({len(daily):,} rows)")


if __name__ == "__main__":
    main()
