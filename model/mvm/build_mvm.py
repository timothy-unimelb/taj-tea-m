"""Build the minimum viable closure-impact model (MVM) from the flat parquet made by model/build_parquet.py.

    python model/mvm/build_mvm.py                   # ~1 min; writes model/mvm/output/*.csv
    python model/mvm/build_mvm.py --parquet "D:/data/closure_site_hour.parquet"

Steps 2-5 of the original model (REPLICATION_CONTEXT.md section 4), in pandas:
  02 volume per site x day x time band, complete site-days only
  03 closure day vs median of the same site/band on d-7 .. d-42 (clean days only)
  04 lookup table (the model): P10/P50/P90 by closure type x work window x time band x road class
  05 validation: train on closures starting before 2026, test on 2026 closures
Step 01 (closures and site pairs) is already in the parquet."""
import argparse, pathlib

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "output"
DEFAULT_PARQUET = HERE.parent / "data" / "closure_site_hour.parquet"                # committed copy
MIN_N, BIG_DROP, TRAIN_BEFORE = 20, -0.15, pd.Timestamp("2026-01-01")
KEYS = ["radar_id", "site_no", "date_local", "time_band"]


def road_class(v):
    return np.select([v < 20000, v < 40000], ["low (<20k/day)", "medium (20-40k/day)"], "high (>40k/day)")


def site_bands(t):
    """02: one row per closure x site x day x time band, complete site-days only"""
    t = t[t.site_day_complete]
    return (t.groupby(KEYS + ["day_offset", "is_closure_day", "is_public_holiday", "site_has_closure_that_day",
                              "same_street"], observed=True)
             .agg(vol=("volume", "sum"), daily=("daily_volume", "first")).reset_index())


def impact(b):
    """03: change = observed band volume / median of the same band on the 6 same-weekdays before - 1"""
    obs = b[b.is_closure_day & ~b.is_public_holiday]
    base_pool = b[~b.is_public_holiday & ~b.site_has_closure_that_day]
    rows = []
    for w in range(7, 43, 7):                                      # d-7, d-14 .. d-42
        x = base_pool[["radar_id", "site_no", "time_band", "date_local", "vol", "daily"]].copy()
        x["date_local"] = x.date_local + pd.Timedelta(days=w)       # shift so it lines up with the closure day
        rows.append(obs[KEYS].merge(x, on=KEYS))
    base = (pd.concat(rows).groupby(KEYS, observed=True)
              .agg(baseline=("vol", "median"), baseline_daily=("daily", "median"), n_base=("vol", "size"))
              .reset_index())
    i = obs.merge(base, on=KEYS)
    i = i[(i.n_base >= 3) & (i.baseline > 0)].copy()
    i["change"] = i.vol / i.baseline - 1
    return i


def per_closure(i, closures):
    """04a: one value per closure x band x site relation, so long closures don't dominate"""
    i = i.assign(site_relation=np.where(i.same_street, "same street", "cross street"))
    pc = (i.groupby(["radar_id", "time_band", "site_relation"], observed=True)
            .agg(change=("change", "median"), site_daily_volume=("baseline_daily", "median"),
                 n_days=("date_local", "nunique"), n_sites=("site_no", "nunique"))
            .reset_index())
    pc = pc.merge(closures[["radar_id", "closure_type", "work_window", "d_from"]], on="radar_id")
    pc["road_class"] = road_class(pc.site_daily_volume)
    return pc


def build_lookup(pc):
    """04b: level 1 = type x window x band x road class; level 2 = without road class; level 3 = band only"""
    g = pd.concat([pc.assign(level=1),
                   pc.assign(level=2, road_class="any"),
                   pc.assign(level=3, closure_type="any", work_window="any", road_class="any")])
    cols = ["level", "site_relation", "closure_type", "work_window", "time_band", "road_class"]
    lk = (g.groupby(cols, observed=True).change
           .agg(n_closures="size", p10=lambda x: x.quantile(0.1), p50=lambda x: x.quantile(0.5),
                p90=lambda x: x.quantile(0.9), mean_change="mean",
                share_over_15pct_drop=lambda x: (x < BIG_DROP).mean())
           .reset_index())
    return lk[lk.n_closures >= MIN_N].reset_index(drop=True)


def validate(pc):
    """05: most specific lookup row (trained before 2026) for each 2026 closure"""
    train = build_lookup(pc[pc.d_from < TRAIN_BEFORE])
    test = pc[pc.d_from >= TRAIN_BEFORE]
    on = ["site_relation", "time_band"]
    cand = pd.concat([
        test.merge(train[train.level == 1], on=on + ["closure_type", "work_window", "road_class"], suffixes=("", "_l")),
        test.merge(train[train.level == 2], on=on + ["closure_type", "work_window"], suffixes=("", "_l")),
        test.merge(train[train.level == 3], on=on, suffixes=("", "_l"))])
    v = (cand.sort_values("level").drop_duplicates(["radar_id", "site_relation", "time_band"])
             .rename(columns={"change": "actual"}))
    err, naive = (v.actual - v.p50).abs(), v.actual.abs()
    summary = (v.assign(err=err, naive=naive, cover=v.actual.between(v.p10, v.p90), l1=v.level == 1)
                .groupby("site_relation", sort=False)
                .agg(n_test=("actual", "size"), mae_model=("err", "median"), mae_no_change=("naive", "median"),
                     mean_abs_err_model=("err", "mean"), mean_abs_err_no_change=("naive", "mean"),
                     p10_p90_coverage=("cover", "mean"), share_level1=("l1", "mean"))
                .reset_index())
    risk = v.share_over_15pct_drop
    bands = (v.assign(predicted_risk_band=np.select([risk < 0.1, risk < 0.2, risk < 0.3],
                                                    ["1: <10%", "2: 10-20%", "3: 20-30%"], "4: >=30%"),
                      big=v.actual < BIG_DROP)
              .groupby(["site_relation", "predicted_risk_band"])
              .agg(n_test=("actual", "size"), predicted_share_over_15pct_drop=("share_over_15pct_drop", "mean"),
                   actual_share_over_15pct_drop=("big", "mean"))
              .reset_index())
    return summary, bands


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parquet", default=DEFAULT_PARQUET, help="closure_site_hour.parquet from build_parquet.py")
    a = ap.parse_args()
    t = pd.read_parquet(a.parquet)
    closures = t.drop_duplicates("radar_id")[["radar_id", "closure_type", "work_window", "d_from", "d_to",
                                             "street_name", "side_street", "category_clean", "closure_lat",
                                             "closure_lon", "impact_text", "work_times_text"]]
    for col in ["closure_type", "work_window", "category_clean"]:
        closures[col] = closures[col].astype(str)
    t["time_band"] = t.time_band.astype(str)

    b = site_bands(t);          print(f"site x day x band rows: {len(b):,}")
    i = impact(b);              print(f"impact rows: {len(i):,} ({i.radar_id.nunique():,} closures)")
    pc = per_closure(i, closures)
    lk = build_lookup(pc);      print(f"lookup rows: {len(lk)} (by level: {lk.level.value_counts().sort_index().to_dict()})")
    summary, bands = validate(pc)

    order = ["level", "site_relation", "closure_type", "work_window", "road_class", "time_band"]
    lk.sort_values(order).to_csv(OUT / "mvm_lookup.csv", index=False)
    (pc.drop(columns="road_class")
       .merge(closures.drop(columns=["closure_type", "work_window", "d_from"]), on="radar_id")
       .rename(columns={"closure_lat": "lat", "closure_lon": "lon"})
       [["radar_id", "closure_type", "work_window", "time_band", "site_relation", "d_from", "change",
         "site_daily_volume", "n_days", "n_sites", "street_name", "side_street", "category_clean", "d_to",
         "lat", "lon", "impact_text", "work_times_text"]]
       .assign(d_from=lambda d: d.d_from.dt.date, d_to=lambda d: d.d_to.dt.date)
       .sort_values(["radar_id", "time_band", "site_relation"])
       .to_csv(OUT / "mvm_per_closure.csv", index=False))
    summary.to_csv(OUT / "mvm_validation_summary.csv", index=False)
    bands.to_csv(OUT / "mvm_validation_risk_bands.csv", index=False)
    print(summary.to_string(index=False))
    print("wrote output/mvm_lookup.csv, mvm_per_closure.csv, mvm_validation_summary.csv, mvm_validation_risk_bands.csv")


if __name__ == "__main__":
    main()
