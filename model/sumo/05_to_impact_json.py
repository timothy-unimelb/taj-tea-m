#!/usr/bin/env python3
"""Compare base and closure runs and write the app's ImpactResult JSON.

    python3 05_to_impact_json.py --hours 8 --seeds 1 2 3                  # one hour
    python3 05_to_impact_json.py --hours $(seq 7 21) --seeds 1 2 3 4 5    # the works period, 7am to 10pm
    ... --banned-summary work/noright/output/summary.json                  # add the banned right turn case

Reads work/runs/{base,closure}_h<hour>_x<scale>_s<seed>/ and writes
  output/swanston.json   ImpactResult (shape in lib/impact/types.ts and model/IMPACT_CONTRACT.md)
  output/summary.json    the raw base vs closure numbers per seed and per hour
Vehicles are matched by id across the two runs, so each difference is the same trip with and without the closure.
Each hour is its own run (30 minute warm-up); only trips that depart in that hour count. Totals add the hours up
per seed, so the range across seeds is a range for the whole period.
"""
import argparse, datetime, json, os, re, statistics, xml.etree.ElementTree as ET
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--hours", type=int, nargs="+", default=[8])
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2, 3])
ap.add_argument("--banned-summary", help="summary.json of the same runs on the network with the La Trobe St right turn banned")
args = ap.parse_args()
hours = sorted(args.hours)


def window(hour):
    t0 = (hour - SIM_START_H) * 3600
    return t0, t0 + 3600


def run_dir(scenario, seed, hour):
    return os.path.join(WORK, "runs", f"{scenario}_h{hour}_x{args.scale:g}_s{seed}")


def trips(d, hour):
    t0, t1 = window(hour)
    out = {}
    for _, el in ET.iterparse(os.path.join(d, "tripinfo.xml")):
        if el.tag == "tripinfo":
            if t0 <= float(el.get("depart")) < t1:
                out[el.get("id")] = (float(el.get("duration")), float(el.get("routeLength")))
            el.clear()
    return out


def drove_block(d, hour):
    """Trips departing in the hour whose last route in this run used the closed block: id -> (first, last edge)."""
    t0, t1 = window(hour)
    ids = {}
    for _, el in ET.iterparse(os.path.join(d, "vehroute.xml")):
        if el.tag == "vehicle":
            r = el.find("route")
            if t0 <= float(el.get("depart")) < t1 and r is not None and closed_edges & set(r.get("edges").split()):
                e = r.get("edges").split()
                ids[el.get("id")] = (e[0], e[-1])
            el.clear()
    return ids


def max_jam(d, hour):
    t0, t1 = window(hour)
    jam = {}
    for _, el in ET.iterparse(os.path.join(d, "queues.xml")):
        if el.tag == "interval" and t0 <= float(el.get("begin")) < t1:
            lane = el.get("id")[2:]
            jam[lane] = max(jam.get(lane, 0.0), float(el.get("maxJamLengthInMeters")))
            el.clear()
    return jam


def teleports(d):
    steps = re.findall(r'<step [^>]*teleports="(\d+)"', open(os.path.join(d, "summary.xml")).read())
    return int(steps[-1]) if steps else 0


def discarded(d):
    m = re.findall(r'<step [^>]*loaded="(\d+)"[^>]*discarded="(\d+)"', open(os.path.join(d, "summary.xml")).read())
    return int(m[-1][1]) / int(m[-1][0]) if m else 0


def entered_block(d):
    """Cars entering the closed block in the run during the hour (edgedata covers exactly the hour)."""
    return sum(float(e.get("entered", 0)) for e in ET.parse(os.path.join(d, "edgedata.xml")).getroot().iter("edge")
               if e.get("id") in closed_edges)


def label(h):
    return f"{h % 12 or 12}{'am' if h < 12 else 'pm'}"


demand = json.load(open(os.path.join(WORK, "demand_summary.json")))
closed_edges = set(demand["closed_edges"])

# ---- per seed, per hour ----------------------------------------------------------------------------------
per_seed, detours, all_users, by_hour, noise, growths, drops, teles = [], [], [], {}, [], [], [], []
for h in hours:
    ent_h, jams_b = [], []
    for seed in args.seeds:
        b, c = run_dir("base", seed, h), run_dir("closure", seed, h)
        tb, tc = trips(b, h), trips(c, h)
        both = tb.keys() & tc.keys()
        users = drove_block(b, h)
        all_users.append(users)
        detours += [tc[v][1] - tb[v][1] for v in users if v in tc and v in tb]
        jb, jc = max_jam(b, h), max_jam(c, h)
        jams_b.append(jb)
        growths.append(max([jc.get(l, 0) - jb.get(l, 0) for l in jc] or [0]))
        drops += [discarded(b), discarded(c)]
        teles.append(teleports(c))
        ent_h.append(entered_block(b) / args.scale)
        per_seed.append(dict(hour=h, seed=seed, trips_base=len(tb), matched=len(both), drove_block_in_base_run=len(users),
                             entered_block_in_base_run=ent_h[-1], delay_veh_h=round(sum(tc[v][0] - tb[v][0] for v in both) / 3600, 1)))
    by_hour[h] = dict(diversions_median=statistics.median(ent_h), diversions_range=[min(ent_h), max(ent_h)])
    noise += [round(max([jams_b[i + 1].get(l, 0) - v for l, v in jams_b[i].items()] or [0])) for i in range(len(jams_b) - 1)]


def total(key, seed):
    return sum(r[key] for r in per_seed if r["seed"] == seed)


def spread(vals, unit):
    vals = sorted(vals)
    return {"low": round(vals[0]), "typical": round(statistics.median(vals)), "high": round(vals[-1]), "unit": unit}


# Delay over the period, per seed, and the noise floor: two normal runs with different seeds carry the same
# trips, so any "delay" between them is run-to-run variation.
delay = spread([total("delay_veh_h", s) for s in args.seeds], "vehicle-hours")
floor_pairs = []
for s1, s2 in zip(args.seeds, args.seeds[1:]):
    tot = 0.0
    for h in hours:
        a, b = trips(run_dir("base", s1, h), h), trips(run_dir("base", s2, h), h)
        tot += sum(b[v][0] - a[v][0] for v in a.keys() & b.keys()) / 3600
    floor_pairs.append(round(tot, 1))
floor = max(abs(x) for x in floor_pairs) if floor_pairs else 0

# Diversions. No counter measures the closed lane. Routes fitted to the counts (03_demand.py) plan few trips
# through it, but in a normal run SUMO's live rerouting sends more drivers through it as a shortcut around
# queues. Those drivers must go another way when it is closed, so the range is the cars entering the block
# in the normal runs, added up over the hours: fewest, median and most across seeds.
diverted = spread([total("entered_block_in_base_run", s) for s in args.seeds], "vehicles")
allowed = dict(diverted)
banned = json.load(open(args.banned_summary))["diversions"] if args.banned_summary else None
if banned:
    diverted["low"] = banned["typical"]  # the low end assumes cars can't turn right from La Trobe St
planned = sum(1 for el in ET.parse(os.path.join(WORK, "affected.trips.xml")).getroot().iter("trip")
              if any(window(h)[0] <= float(el.get("depart")) < window(h)[1] for h in hours))

# Detour. Low: the shortest way round for these drivers (median). Typical and high: the extra distance the
# same drivers actually drove with the block closed, median and upper quartile. Live rerouting picks the
# fastest route, not the shortest, so driven detours vary a lot and some are negative.
net_full, net_closed = load_net(), sumolib.net.readNet(os.path.join(WORK, "net_closed.net.xml"))
short = []
for f, t in {ft for users in all_users for ft in users.values()}:
    a = net_full.getShortestPath(net_full.getEdge(f), net_full.getEdge(t), vClass="passenger")
    c = net_closed.getShortestPath(net_closed.getEdge(f), net_closed.getEdge(t), vClass="passenger")
    if a[0] and c[0]:
        short.append(c[1] - a[1])
detours.sort()
q = lambda xs, p: round(xs[min(len(xs) - 1, int(p * len(xs)))]) if xs else 0
detour = {"low": round(statistics.median(short)) if short else 0, "typical": max(0, q(detours, 0.5)), "high": max(0, q(detours, 0.75)), "unit": "m"}

ac = json.load(open(os.path.join(WORK, "approach_counts.json")))
latrobe = sum(v[h] for v in ac["sites"]["2921"]["approaches"].values() for h in hours)
drop, tele = max(drops), max(teles)
peak_h = max(by_hour, key=lambda h: by_hour[h]["diversions_median"])

one = len(hours) == 1
span = f"{label(hours[0])} to {label(hours[-1] + 1)}"
over = "in this hour" if one else f"over the works period ({span})"
noisy = delay["low"] < 0 <= delay["high"] or delay["high"] < 0 or abs(delay["typical"]) <= floor
delay_text = ("The change in total travel time is too small to separate from run-to-run variation."
              if noisy else f"Total extra travel time is about {delay['typical']:,} vehicle-hours.")
banned_text = (f" If cars can't turn right from La Trobe St into Swanston St, it is about {banned['typical']:,}." if banned else "")

result = {
    "model": "sumo",
    "method": "SUMO traffic simulation",
    "label": "Early result",
    "provenance": "precomputed",
    "confidence": "low",
    "confidence_note": "Traffic is fitted to measured car counts at the surrounding junctions, but no counter measures the closed lane itself, routes are inferred, and signal timings are guessed.",
    "period": f"Monday {span}" + (", the morning peak" if hours == [8] else ", the works hours" if not one else ""),
    "recommended_window": None,
    "modes": {
        "cars": {
            "status": "modelled",
            **({} if noisy else {"delay": delay}), "forced_diversions": diverted, "detour": detour,
            "summary": f"About {allowed['low']:,} to {allowed['high']:,} drivers {over} use the block as a shortcut from La Trobe St to A'Beckett St and must go another way.{banned_text} "
                       + (f"Most drive no further, some up to about {int(round(detour['high'], -1))} m. " if detour["typical"] == 0 else
                        f"Most drive up to about {int(round(detour['high'], -1))} m further. ") + delay_text,
        },
        "public_transport": {"status": "not modelled", "summary": "Trams are in the street network but no tram services were simulated."},
        "pedestrians": {"status": "not modelled", "summary": "SUMO can model pedestrians, but this run covers cars only."},
        "trucks": {"status": "not modelled", "summary": "All vehicles are simulated as cars. Trucks are not modelled on their own."},
    },
    "assumptions": [
        (f"One simulated hour, {span} on a weekday, after a 30 minute warm-up. Other hours of the works were not simulated." if one else
         f"Every hour of the works, {span} on a weekday, simulated separately after a 30 minute warm-up, and added up. The busiest hour for diversions is {label(peak_h)} to {label(peak_h + 1)}."),
        "Street network from OpenStreetMap (© OpenStreetMap contributors), built with SUMO netconvert. Signal timings are guessed, not the real SCATS plans.",
        (f"Traffic fitted to car counts per approach from SCATS stop-line detectors at the {len(demand['measured_sites'])} junctions around the closure "
         f"(August 2026 weekdays, detector roles from DTP signal sheets), and to {len(demand['counting_sites']) - len(demand['measured_sites'])} other CBD signal sites, "
         f"using SUMO routeSampler. Whole-site SCATS totals also count bikes, trams and queue loops, so the other sites' totals were cut to "
         f"{demand['car_share_of_site_total']:.0%}, the car share found at the measured junctions.")
        if demand.get("count_method", "").startswith("detector") else
        f"Traffic fitted to weekday counts at {len(demand['counting_sites'])} SCATS signal sites in the CBD, including 2921 SWANSTON/LATROBE, using SUMO routeSampler and the SCATS weekday hourly profile.",
        (f"Only {args.scale:.0%} of that traffic was inserted, so delay is likely understated.") if args.scale != 1 else
        "All of the counted traffic was inserted." + (f" The fitted traffic matches {demand['geh_ok_share_worst_hour']:.0f}% of counted streets within the usual tolerance (GEH under 5) in every hour."
                                                     if demand.get("geh_ok_share_worst_hour") else ""),
        f"Closure: the only car lane on Swanston St between La Trobe St and Little La Trobe St ({', '.join(demand['closed_edges'])}, northbound) is closed. The rest of the block is tram only in OpenStreetMap, as on the street.",
        "That lane is the only car entry to Little La Trobe St and the east end of A'Beckett St, so the closure cuts car access to them. "
        f"Trips ending there are removed from both runs rather than counted ({demand['removed_destination_cut_off_by_closure']} in this demand).",
        f"Diversions: no counter measures the closed lane. Routes fitted to the counts plan {planned} trips through it {over}, but in normal runs {allowed['low']:,} to {allowed['high']:,} drivers use it as a shortcut around queues. "
        f"The range is those drivers. Measured counts cap it: every car entering the block comes from La Trobe St, which carries {latrobe:,.0f} cars {over}, both directions together (SCATS detectors at site 2921).",
        ("The shortcut needs a right turn from westbound La Trobe St into Swanston St. The signal plan for site 2921 shows no car right-turn signal there, only a bike hook turn. "
         f"The same runs with that turn banned give {banned['low']:,} to {banned['high']:,} drivers (median {banned['typical']:,}), which is the low end of the range.") if banned else
        "The shortcut needs a right turn from westbound La Trobe St into Swanston St. The simulation allows it, but the signal plan for site 2921 shows no car right-turn signal there. If the turn is banned, almost no cars use the block.",
        "Detour: the low value is the shortest way round for these drivers. Typical and high are the extra distance they actually drove with the block closed (median and upper quartile), with live rerouting.",
        f"Up to {drop:.0%} of cars could not enter the network within 5 minutes and were dropped. Delay is likely understated.",
        f"Delay is the extra travel time of the same trips with and without the closure, for all trips {over}, across {len(args.seeds)} random seeds. "
        f"Two normal runs differ by up to {floor:,.0f} vehicle-hours on their own"
        + (f", and the closure runs differ from normal by {delay['low']:,} to {delay['high']:,}, so no delay is reported (like queue, it would be rated on noise)." if noisy else ", so a smaller effect would be reported as noise."),
        f"Queue growth could not be separated from run-to-run variation. Normal runs differ from each other by up to {max(noise)} m on their worst lane, so no queue is reported.",
        f"Cars stuck for 5 minutes are moved on by SUMO (teleported). Up to {tele:,} teleports in a closure run.",
        "Trams keep running in reality, but no tram services were simulated, so tram delays are not included.",
    ],
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
os.makedirs(OUT, exist_ok=True)
json.dump(result, open(os.path.join(OUT, "swanston.json"), "w"), indent=2, ensure_ascii=False)
json.dump(dict(hours=hours, scale=args.scale, seeds=args.seeds, diversions=diverted, diversions_turn_allowed=allowed,
               diversions_turn_banned=banned, by_hour=by_hour, planned_through_block=planned, delay=delay,
               delay_noise_pairs=floor_pairs, detour_m=detour, simulated_detour_quartiles_m=[q(detours, 0.25), q(detours, 0.5), q(detours, 0.75)],
               n_detours=len(detours), queue_growth_max_m=round(max(growths)), base_vs_base_worst_lane_m=noise,
               max_dropped_share=round(drop, 3), per_seed=per_seed), open(os.path.join(OUT, "summary.json"), "w"), indent=2)
print(json.dumps(by_hour, indent=1))
print("cars:", json.dumps(result["modes"]["cars"], indent=1))
