#!/usr/bin/env python3
"""Car counts per junction approach, from SCATS detector counts and DTP signal sheets.

The SCATS site totals the rest of the pipeline used (model/headline_stats) add up every detector at a site:
bike loops, tram loops, queue loops that count the same cars again upstream, and at some sites a second
set of detectors at a nearby tram stop. At SWANSTON/LATROBE that is about 3 times the real car count.

This script counts only the car stop-line detectors, per approach. Which detector is which comes from
DTP's Traffic Signal Configuration Data Sheets, read by hand into detector_approaches.json.

    python3 00_detector_counts.py            # downloads one month of counts (about 135 MB) the first time

Writes work/approach_counts.json:
  sites.<site_no>.approaches.<direction> = 24 weekday hourly medians (vehicles)
  sites.<site_no>.car_daily, all_detectors_daily
  car_share_of_site_total = median of car_daily / the headline_stats site total, over the mapped sites
  where every car approach has a working detector.
  03_demand.py uses it to correct sites without a sheet.
"""
import argparse, collections, csv, datetime, io, json, os, statistics, urllib.request, zipfile
from common import *

MONTHS = {  # DTP Traffic Signal Volume Data, monthly files (CC-BY 4.0)
    "2026-08": "https://opendata.transport.vic.gov.au/dataset/331b846b-1e18-415f-a3f3-ce4198d86c82/resource/"
               "ce074c05-93ed-4ce8-bee4-c327527a743c/download/traffic_signal_volume_data_august_2026.zip",
}
ap = argparse.ArgumentParser()
ap.add_argument("--month", default="2026-08", choices=sorted(MONTHS))
args = ap.parse_args()

spec = json.load(open(os.path.join(HERE, "detector_approaches.json")))["sites"]
zpath = os.path.join(WORK, f"vsdata_{args.month}.zip")
if not os.path.exists(zpath):
    print("downloading", MONTHS[args.month])
    urllib.request.urlretrieve(MONTHS[args.month], zpath + ".part")
    os.rename(zpath + ".part", zpath)

# weekday hourly volumes per (site, detector), skipping detector-days with alarms or missing intervals
wanted = {int(s) for s in spec}
hours = collections.defaultdict(lambda: collections.defaultdict(list))
z = zipfile.ZipFile(zpath)
for name in z.namelist():
    d = datetime.date.fromisoformat(f"{name[7:11]}-{name[11:13]}-{name[13:15]}")  # VSDATA_YYYYMMDD.csv
    if d.weekday() >= 5:
        continue
    for r in csv.reader(io.TextIOWrapper(z.open(name))):
        if not r[0].isdigit() or int(r[0]) not in wanted:
            continue
        v = [int(x) for x in r[3:99]]
        if any(x < 0 for x in v) or int(r[-1]) > 0:
            continue
        for h in range(24):
            hours[(int(r[0]), int(r[2]))][h].append(sum(v[4 * h:4 * h + 4]))
med = {k: [statistics.median(h[i]) if h[i] else 0 for i in range(24)] for k, h in hours.items()}

site_total = {s["site_no"]: s["daily"] for s in scats_sites()}
out, ratios = {}, []
for s, info in spec.items():
    s = int(s)
    appr = {d: [sum(med.get((s, det), [0] * 24)[h] for det in dets) for h in range(24)]
            for d, dets in info["car_detectors"].items()}
    missing = [det for dets in info["car_detectors"].values() for det in dets if (s, det) not in med]
    car = sum(sum(v) for v in appr.values())
    alld = sum(sum(v) for (site, _), v in med.items() if site == s)
    out[s] = dict(approaches=appr, car_daily=round(car), all_detectors_daily=round(alld),
                  headline_stats_daily=round(site_total.get(s, 0)), missing_detectors=missing)
    if site_total.get(s) and not missing and info.get("all_car_approaches_counted"):
        ratios.append(car / site_total[s])
    print(f"{s}: cars {car:,.0f}/day on {len(appr)} approaches; all detectors {alld:,.0f}; "
          f"site total used before {site_total.get(s, 0):,.0f}" + (f"; no data for detectors {missing}" if missing else ""))

share = statistics.median(ratios)
json.dump(dict(month=args.month, sites=out, car_share_of_site_total=share),
          open(os.path.join(WORK, "approach_counts.json"), "w"), indent=1)
print(f"car share of the old site totals: median {share:.2f} (range {min(ratios):.2f} to {max(ratios):.2f}, {len(ratios)} sites)")
