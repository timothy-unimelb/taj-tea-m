"""Build one flat table from the raw files behind the closure-impact model and save it as compressed parquet.

    python model/build_parquet.py                       # reads <root>/raw, writes model/data/closure_site_hour.parquet
    python model/build_parquet.py --root "D:/data/FEIT Smart City Hackathon" --workers 8

One row = closure x signal site within 200 m x day x hour, for every day from 6 weeks before the closure
to its last day. So each closure carries its own baseline weeks. Columns come from five sources:
  RADAR roadworks (closures), SCATS volumes (counts, summed to site x hour), SCATS site locations,
  AADT road segments (nearest segment to the closure) and Victorian public holidays.

Filters and parsing follow the original model (see model/mvm/REPLICATION_CONTEXT.md), so the counts can be
checked against it: 6,514 closures; 4,477 pairs, 3,075 closures, 591 sites.
Raw files are only read, never changed. Needs pandas, numpy, pyarrow and pyproj."""
import argparse, datetime as dt, io, json, pathlib, time, warnings, zipfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pyproj import Transformer

MELB = dict(lat=(-38.2, -37.5), lon=(144.5, 145.5))      # Greater Melbourne box, as in the model
PERIOD = (dt.date(2024, 1, 1), dt.date(2026, 9, 23))       # SCATS coverage
CATEGORIES = {"Planned Roadworks", "Unplanned Roadworks", "Utilities / Construction", "Planned Event"}
PAIR_M, BASELINE_DAYS, AADT_MAX_M = 200, 42, 100
V_COLS = [f"V{i:02d}" for i in range(96)]
warnings.filterwarnings("ignore", message="This pattern is interpreted as a regular expression")


def log(msg, t0=[time.time()]):
    print(f"[{time.time() - t0[0]:6.0f}s] {msg}", flush=True)


def snapshot(raw, key):
    """latest download folder of a dataset: raw/<key>/<yyyymmdd>/"""
    return sorted(p for p in (raw / key).iterdir() if p.is_dir())[-1]


def haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * np.arcsin(np.sqrt(a))


# ----------------------------------------------------------------------------- closures (RADAR)
def load_closures(raw):
    rows = []
    for f in sorted(snapshot(raw, "radar_roadworks_vic").glob("*.geojson")):
        for feat in json.loads(f.read_text(encoding="utf-8"))["features"]:
            if not feat.get("geometry"):
                continue
            p = feat["properties"]
            lon, lat = feat["geometry"]["coordinates"][:2]
            rows.append({"radar_id": p.get("id"), "state": p.get("state"), "category_clean": p.get("updated_category"),
                         "street_name": p.get("street_name"), "side_street": p.get("side_street"),
                         "end_side_street": p.get("end_side_street"), "direction": p.get("direction"),
                         "description": p.get("description"), "from_ms": p.get("from_date"),
                         "to_ms": p.get("to_date"), "closure_lat": lat, "closure_lon": lon})
    c = pd.DataFrame(rows)
    c["radar_id"] = c.radar_id.astype("int64")
    for col, ms in [("ts_from", "from_ms"), ("ts_to", "to_ms")]:
        c[col] = pd.to_datetime(c[ms], unit="ms", utc=True).dt.tz_convert("Australia/Melbourne")
    c["d_from"], c["d_to"] = c.ts_from.dt.date, c.ts_to.dt.date
    c = c[(c.state == "VIC") & c.closure_lat.between(*MELB["lat"]) & c.closure_lon.between(*MELB["lon"])
          & c.category_clean.isin(CATEGORIES) & c.street_name.notna() & c.d_from.notna() & c.d_to.notna()]
    days = (pd.to_datetime(c.d_to) - pd.to_datetime(c.d_from)).dt.days
    c = c[(c.d_to >= PERIOD[0]) & (c.d_from <= PERIOD[1]) & days.between(0, 7)].copy()

    # parse the DTP text (rules from the original model, REPLICATION_CONTEXT.md section 4)
    desc = c.description.fillna("")
    low = desc.str.lower()
    c["closure_type"] = np.select(
        [low.str.contains(r"impact to traffic will be (road|carriageway) closed|road (is |will be )?closed"
                          r"|full (road )?closure|closed to (all )?traffic"),
         low.str.contains(r"impact to traffic will be [^.]*ramp"),
         low.str.contains(r"impact to traffic will be [^.]*lane")],
        ["road closed", "ramp closed", "lanes closed"], "unspecified")
    c["impact_text"] = desc.str.extract(r"Impact to traffic will be ([^.]*)", expand=False)
    c["work_times_text"] = desc.str.extract(r"during the following times: ([^.]*?)\. Impact", expand=False)
    c["work_window"] = np.select(
        [desc.str.contains(r"(Weekdays|Weekends) 12:00 AM to 12:00 AM"),
         desc.str.contains(r"(Weekdays|Weekends) ([7-9]|1[01]):[0-9]{2} PM to ([1-9]|1[0-2]):[0-9]{2} AM")
         | desc.str.contains(r"(Weekdays|Weekends) 12:[0-9]{2} AM to [1-6]:[0-9]{2} AM"),
         desc.str.contains(r"(Weekdays|Weekends) ([5-9]|1[01]):[0-9]{2} AM to ([1-9]|1[0-2]):[0-9]{2} (AM|PM)")],
        ["24 hours", "night", "day"], "unspecified")
    key = c.street_name.str.upper().str.replace(r"\s*-\s.*$", "", regex=True)
    key = key.str.replace(r"\s+(STREET|ST|ROAD|RD|AVENUE|AVE|AV|HIGHWAY|HWY|PARADE|PDE|DRIVE|DR|BOULEVARD|BVD|BLVD"
                          r"|LANE|LA|PLACE|PL|CRESCENT|CRES|WAY|FREEWAY|FWY|TERRACE|TCE|GROVE|GR|COURT|CT)\b.*$",
                          "", regex=True)
    c["street_key"] = key.str.strip()
    return c.drop(columns=["state", "from_ms", "to_ms"])


# ----------------------------------------------------------------------------- signal sites
def load_sites(raw):
    f = next(snapshot(raw, "scats_sites").glob("*.csv"))
    s = pd.read_csv(f, dtype=str, encoding="utf-8-sig")
    s["site_no"] = pd.to_numeric(s.SITE_NO, errors="coerce")
    s["x"], s["y"] = pd.to_numeric(s.X, errors="coerce"), pd.to_numeric(s.Y, errors="coerce")
    s = s.dropna(subset=["site_no", "x", "y"])
    lon, lat = Transformer.from_crs("EPSG:7899", "EPSG:4326", always_xy=True).transform(s.x.values, s.y.values)
    s["site_lat"], s["site_lon"] = lat, lon
    s = s[s.site_lat.between(-39.5, -33.5) & s.site_lon.between(140.5, 150.5)]   # drops placeholder points
    return (s.groupby(s.site_no.astype("int64"))
             .agg(site_name=("SITE_NAME", "first"), site_type=("SITE_TYPE", "first"), site_status=("STATUS", "first"),
                  site_lat=("site_lat", "mean"), site_lon=("site_lon", "mean"))
             .reset_index())


def pair_closures_sites(c, s):
    s = s[s.site_type == "INT"]
    out = []
    for r in c[["radar_id", "closure_lat", "closure_lon", "street_key"]].itertuples(index=False):
        near = s[((s.site_lat - r.closure_lat).abs() < 0.002) & ((s.site_lon - r.closure_lon).abs() < 0.0025)]
        if near.empty:
            continue
        d = haversine_m(r.closure_lat, r.closure_lon, near.site_lat.values, near.site_lon.values)
        hit = near[d <= PAIR_M].assign(dist_m=d[d <= PAIR_M], radar_id=r.radar_id)
        key = r.street_key or ""
        hit["same_street"] = [len(key) >= 3 and key in str(n).upper() for n in hit.site_name]
        out.append(hit[["radar_id", "site_no", "dist_m", "same_street"]])
    return pd.concat(out, ignore_index=True)


# ----------------------------------------------------------------------------- AADT (nearest road segment)
def load_aadt(raw):
    """latest year per road segment and direction, Greater Melbourne only"""
    seen, rows = set(), []
    for f in sorted(snapshot(raw, "aadt").glob("*.geojson"), reverse=True):        # newest year first
        for feat in json.loads(f.read_text(encoding="utf-8"))["features"]:
            g, p = feat.get("geometry"), feat["properties"]
            if not g or not g.get("coordinates") or p.get("Road Segment ID") is None:
                continue
            lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
            pts = np.array([pt[:2] for line in lines for pt in line])
            if not ((pts[:, 1].max() >= MELB["lat"][0]) & (pts[:, 1].min() <= MELB["lat"][1])
                    & (pts[:, 0].max() >= MELB["lon"][0]) & (pts[:, 0].min() <= MELB["lon"][1])):
                continue
            k = (int(p["Road Segment ID"]), p.get("Travel Direction"))
            if k in seen:
                continue
            seen.add(k)
            rows.append({"segment_id": k[0], "direction": k[1], "year": int(p["Calendar Year"]),
                         "road_name": p.get("Road Name"), "section": (p.get("Road Section Description") or "").strip(),
                         "aadt": p.get("Average Annual Daily Traffic Volume"),
                         "aadt_heavy": p.get("Average Annual Daily Heavy Vehicle Volume"), "lines": lines})
    return rows


def nearest_aadt(c, aadt_rows):
    """AADT of the road segment nearest each closure (within AADT_MAX_M), summed over the directions published
    under that segment id. Many segments carry one direction only: check aadt_directions."""
    to_m = Transformer.from_crs("EPSG:4326", "EPSG:7899", always_xy=True)
    ax, ay, bx, by, owner = [], [], [], [], []
    for i, r in enumerate(aadt_rows):
        for line in r["lines"]:
            x, y = to_m.transform(*np.array(line)[:, :2].T)
            ax += list(x[:-1]); ay += list(y[:-1]); bx += list(x[1:]); by += list(y[1:]); owner += [i] * (len(x) - 1)
    ax, ay, bx, by, owner = map(np.asarray, (ax, ay, bx, by, owner))
    dx, dy = bx - ax, by - ay
    len2 = np.where(dx * dx + dy * dy == 0, 1e-9, dx * dx + dy * dy)
    px, py = to_m.transform(c.closure_lon.values, c.closure_lat.values)
    best = []
    for x, y in zip(px, py):
        t = np.clip(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1)
        d = np.hypot(ax + t * dx - x, ay + t * dy - y)
        j = int(d.argmin())
        best.append((owner[j], d[j]) if d[j] <= AADT_MAX_M else (None, None))

    seg = pd.DataFrame([{k: v for k, v in r.items() if k != "lines"} for r in aadt_rows])
    by_seg = seg.groupby(["segment_id", "year"]).agg(aadt=("aadt", "sum"), aadt_heavy=("aadt_heavy", "sum"),
                                                     aadt_directions=("direction", lambda x: " + ".join(sorted(set(x)))))
    by_seg = by_seg.reset_index()
    out = []
    for radar_id, key, (i, d) in zip(c.radar_id, c.street_key.fillna(""), best):
        if i is None:
            out.append({"radar_id": radar_id}); continue
        r = aadt_rows[i]
        tw = by_seg[(by_seg.segment_id == r["segment_id"]) & (by_seg.year == r["year"])].iloc[0]
        out.append({"radar_id": radar_id, "aadt_segment_id": r["segment_id"], "aadt_road_name": r["road_name"],
                    "aadt_section": r["section"], "aadt_year": r["year"], "aadt_dist_m": round(float(d), 1),
                    "aadt_same_street": len(key) >= 3 and key in str(r["road_name"]).upper(),
                    "aadt": tw.aadt, "aadt_heavy": tw.aadt_heavy, "aadt_directions": tw.aadt_directions})
    return pd.DataFrame(out)


# ----------------------------------------------------------------------------- SCATS counts -> site x hour
def _day_to_site_hour(csv_bytes, sites):
    d = pd.read_csv(io.BytesIO(csv_bytes), usecols=["NB_SCATS_SITE", "QT_INTERVAL_COUNT", "NB_DETECTOR", *V_COLS,
                                                    "NM_REGION", "CT_ALARM_24HOUR"], dtype=str)
    d["site_no"] = pd.to_numeric(d.NB_SCATS_SITE, errors="coerce")
    alarm = pd.to_numeric(d.CT_ALARM_24HOUR, errors="coerce").fillna(0)
    keep = alarm == 0                                               # detectors with alarms that day are dropped
    d = d[keep & d.site_no.isin(sites)] if sites is not None else d[keep & d.site_no.notna()]
    if d.empty:
        return None
    v = d[V_COLS].apply(pd.to_numeric, errors="coerce").to_numpy(dtype="float64").reshape(len(d), 24, 4)
    ok = v >= 0                                                     # negative or blank = missing slot
    vol = np.where(ok, v, 0).sum(axis=2)
    has = ok.any(axis=2)
    miss = (~ok).sum(axis=2)
    n = len(d)
    long = pd.DataFrame({"site_no": np.repeat(d.site_no.to_numpy("int64"), 24),
                         "date_local": np.repeat(pd.to_datetime(d.QT_INTERVAL_COUNT.str[:10]).dt.date.to_numpy(), 24),
                         "hour_local": np.tile(np.arange(24), n),
                         "volume": np.where(has, vol, np.nan).ravel(),
                         "detector": np.repeat(d.NB_DETECTOR.to_numpy(), 24),
                         "n_missing_slots": miss.ravel(),
                         "region": np.repeat(d.NM_REGION.to_numpy(), 24)})
    g = long.groupby(["site_no", "date_local", "hour_local"])
    out = g.agg(n_detectors=("detector", "nunique"), n_missing_slots=("n_missing_slots", "sum"),
                region=("region", "max"))
    out.insert(0, "volume", g.volume.sum(min_count=1))              # NaN when every slot was missing
    return out.reset_index()


def _month_task(args):
    """one monthly zip of daily VSDATA CSVs (or a monthly zip inside the 2024 annual zip); sites=None keeps all"""
    zip_path, inner, sites = args
    with zipfile.ZipFile(zip_path) as z:
        zf = zipfile.ZipFile(io.BytesIO(z.read(inner))) if inner else z
        parts = [_day_to_site_hour(zf.read(n), sites) for n in sorted(zf.namelist()) if n.lower().endswith(".csv")]
    parts = [p for p in parts if p is not None]
    return (inner or pathlib.Path(zip_path).name), len(parts), (pd.concat(parts) if parts else None)


def load_scats(raw, sites, workers, months_wanted=None):
    """site x hour counts. sites=None keeps every site; months_wanted limits to month names like 'april_2025'"""
    tasks, months = [], set()
    for key in ("scats_volume", "scats_volume_annual"):             # monthly zips first; each month read once
        for zp in sorted(snapshot_all(raw, key)):
            with zipfile.ZipFile(zp) as z:
                inner = [n for n in z.namelist() if n.lower().endswith(".zip")]
            for label in (inner or [None]):
                month = pathlib.PurePosixPath(label or zp.name).stem.lower()
                if month in months or (months_wanted and month.replace("traffic_signal_volume_data_", "")
                                                           not in months_wanted):
                    continue
                months.add(month); tasks.append((str(zp), label, None if sites is None else set(sites)))
    log(f"SCATS: {len(tasks)} monthly zips to read with {workers} workers")
    out = []
    with ProcessPoolExecutor(workers) as ex:
        for name, n_days, df in ex.map(_month_task, tasks):
            log(f"  {name}: {n_days} days"); out.append(df)
    return pd.concat([d for d in out if d is not None], ignore_index=True)


def snapshot_all(raw, key):
    """complete zips in every download folder of a dataset (unfinished .zip.part files are skipped)"""
    return [p for d in (raw / key).iterdir() if d.is_dir() for p in d.glob("*.zip")] if (raw / key).exists() else []


# ----------------------------------------------------------------------------- Victorian public holidays
AFL_GF_FRIDAY = {2015: "2015-10-02", 2016: "2016-09-30", 2017: "2017-09-29", 2018: "2018-09-28", 2019: "2019-09-27",
                 2020: "2020-10-23", 2021: "2021-09-24", 2022: "2022-09-23", 2023: "2023-09-29", 2024: "2024-09-27",
                 2025: "2025-09-26", 2026: "2026-09-25"}


def _easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    return dt.date(y, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)


def _nth_weekday(y, month, weekday, n):
    d = dt.date(y, month, 1)
    return d + dt.timedelta(days=(weekday - d.weekday()) % 7) + dt.timedelta(weeks=n - 1)


def vic_public_holidays(y0=2023, y1=2027):
    """Victorian public holidays, including observed days and the AFL Grand Final Friday"""
    out = []
    for y in range(y0, y1 + 1):
        for m, dd, name in [(1, 1, "New Year's Day"), (1, 26, "Australia Day")]:
            d = dt.date(y, m, dd); out.append((d, name))
            if d.weekday() >= 5:
                out.append((d + dt.timedelta(days=7 - d.weekday()), name + " (observed)"))
        e = _easter(y)
        out += [(_nth_weekday(y, 3, 0, 2), "Labour Day"), (e - dt.timedelta(days=2), "Good Friday"),
                (e - dt.timedelta(days=1), "Easter Saturday"), (e, "Easter Sunday"),
                (e + dt.timedelta(days=1), "Easter Monday"), (dt.date(y, 4, 25), "ANZAC Day"),
                (_nth_weekday(y, 6, 0, 2), "King's/Queen's Birthday"), (_nth_weekday(y, 11, 1, 1), "Melbourne Cup")]
        if y in AFL_GF_FRIDAY:
            out.append((dt.date.fromisoformat(AFL_GF_FRIDAY[y]), "Friday before AFL Grand Final"))
        xmas = dt.date(y, 12, 25)
        out += [(xmas, "Christmas Day"), (dt.date(y, 12, 26), "Boxing Day")]
        if xmas.weekday() == 5:
            out += [(dt.date(y, 12, 27), "Christmas Day (observed)"), (dt.date(y, 12, 28), "Boxing Day (observed)")]
        elif xmas.weekday() == 6:
            out.append((dt.date(y, 12, 27), "Christmas Day (observed)"))
        elif xmas.weekday() == 4:
            out.append((dt.date(y, 12, 28), "Boxing Day (observed)"))
    h = pd.DataFrame(out, columns=["date_local", "holiday_name"])
    return h.groupby("date_local").holiday_name.agg(" / ".join).reset_index()


# ----------------------------------------------------------------------------- join and write
BAND = {h: "AM peak" if 7 <= h <= 8 else "Inter-peak" if 9 <= h <= 15 else "PM peak" if 16 <= h <= 18 else "Night"
        for h in range(24)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=r"C:\Users\T\Documents\Subjects\FEIT Smart City Hackathon",
                    help="folder that holds raw/")
    ap.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parent / "data" / "closure_site_hour.parquet"),
                    help="parquet to write (default: the copy committed in model/data/)")
    ap.add_argument("--workers", type=int, default=12, help="processes reading SCATS zips (about 1 GB RAM each)")
    a = ap.parse_args()
    root = pathlib.Path(a.root); raw = root / "raw"

    c = load_closures(raw);                 log(f"closures: {len(c):,}")
    s = load_sites(raw);                    log(f"signal sites: {len(s):,}")
    p = pair_closures_sites(c, s)
    log(f"pairs within {PAIR_M} m: {len(p):,} ({p.radar_id.nunique():,} closures, {p.site_no.nunique():,} sites)")
    ad = nearest_aadt(c[c.radar_id.isin(p.radar_id)], load_aadt(raw))
    log(f"AADT: nearest segment found for {ad.aadt_segment_id.notna().sum():,} of {len(ad):,} closures")
    hol = vic_public_holidays()
    sh = load_scats(raw, sorted(p.site_no.unique()), a.workers)
    log(f"SCATS site-hours for matched sites: {len(sh):,}")

    # site-day completeness, as used by the model (24 hours, no missing slots, volume > 0)
    day = sh.groupby(["site_no", "date_local"]).agg(n_hours=("hour_local", "size"), daily_volume=("volume", "sum"),
                                                    max_missing=("n_missing_slots", "max")).reset_index()
    day["site_day_complete"] = (day.n_hours == 24) & (day.max_missing == 0) & (day.daily_volume > 0)

    # days each site had any closure active within 200 m (the model leaves these out of the baseline)
    cp = p.merge(c[["radar_id", "d_from", "d_to"]], on="radar_id")
    busy = {(r.site_no, d.date()) for r in cp.itertuples() for d in pd.date_range(r.d_from, r.d_to)}

    # spine: pair x date (baseline weeks + closure days) x hour
    spine = cp.assign(date_local=[list(pd.date_range(f - dt.timedelta(days=BASELINE_DAYS), t).date)
                                  for f, t in zip(cp.d_from, cp.d_to)]).explode("date_local")
    spine["date_local"] = spine.date_local.astype("object")
    spine = spine.merge(pd.DataFrame({"hour_local": range(24)}), how="cross")
    spine["day_offset"] = (pd.to_datetime(spine.date_local) - pd.to_datetime(spine.d_from)).dt.days
    spine["is_closure_day"] = spine.day_offset >= 0
    spine["is_baseline_week"] = spine.day_offset.isin(range(-BASELINE_DAYS, 0, 7))
    spine["site_has_closure_that_day"] = [(sn, d) in busy for sn, d in zip(spine.site_no, spine.date_local)]
    spine = spine.drop(columns=["d_from", "d_to"])

    dts = pd.to_datetime(spine.date_local)
    spine["dow"] = dts.dt.dayofweek + 1                             # 1 = Mon .. 7 = Sun
    spine["is_weekend"] = spine.dow >= 6
    spine["time_band"] = spine.hour_local.map(BAND)

    t = (spine.merge(c, on="radar_id", how="left")
              .merge(s, on="site_no", how="left")
              .merge(ad, on="radar_id", how="left")
              .merge(sh, on=["site_no", "date_local", "hour_local"], how="left")
              .merge(day[["site_no", "date_local", "daily_volume", "site_day_complete"]],
                     on=["site_no", "date_local"], how="left")
              .merge(hol, on="date_local", how="left"))
    t["is_public_holiday"] = t.holiday_name.notna()
    t["site_day_complete"] = t.site_day_complete.fillna(False).astype(bool)
    t["date_local"] = pd.to_datetime(t.date_local)
    for col in ["d_from", "d_to"]:
        t[col] = pd.to_datetime(t[col])
    t = t.sort_values(["radar_id", "site_no", "date_local", "hour_local"]).reset_index(drop=True)

    front = ["radar_id", "site_no", "date_local", "hour_local", "time_band", "day_offset", "is_closure_day",
             "is_baseline_week", "volume", "daily_volume", "site_day_complete", "n_detectors", "n_missing_slots",
             "site_has_closure_that_day", "dow", "is_weekend", "is_public_holiday", "holiday_name",
             "closure_type", "work_window", "category_clean", "street_name", "street_key", "side_street",
             "end_side_street", "direction", "d_from", "d_to", "ts_from", "ts_to", "closure_lat", "closure_lon",
             "impact_text", "work_times_text", "description",
             "site_name", "site_type", "site_status", "site_lat", "site_lon", "region", "dist_m", "same_street"]
    t = t[front + [col for col in t.columns if col not in front]]
    for col in ["closure_type", "work_window", "category_clean", "time_band", "region", "site_type", "site_status"]:
        t[col] = t[col].astype("category")

    out = pathlib.Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(t, preserve_index=False), out, compression="zstd", compression_level=9,
                   row_group_size=1_000_000)
    log(f"wrote {out} : {len(t):,} rows x {t.shape[1]} columns, {out.stat().st_size / 1e6:.0f} MB")
    log(f"rows with a SCATS count: {t.volume.notna().mean():.1%}")


if __name__ == "__main__":
    main()
