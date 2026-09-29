#!/usr/bin/env python3
"""Compare base and closure runs and write the app's ImpactResult JSON.

    python3 05_to_impact_json.py --hour 8 --scale 1 --seeds 1 2 3

Reads work/runs/{base,closure}_h<hour>_x<scale>_s<seed>/ and writes
  output/swanston.json   ImpactResult (shape in lib/impact/types.ts and model/IMPACT_CONTRACT.md)
  output/summary.json    the raw base vs closure numbers per seed
Vehicles are matched by id across the two runs, so each difference is the same trip with and without the closure.
Only trips that depart in the reported hour count.
"""
import argparse, datetime, json, os, re, statistics, xml.etree.ElementTree as ET
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--hour", type=int, default=8)
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2, 3])
args = ap.parse_args()
t0 = (args.hour - SIM_START_H) * 3600
t1 = t0 + 3600


def run_dir(scenario, seed):
    return os.path.join(WORK, "runs", f"{scenario}_h{args.hour}_x{args.scale:g}_s{seed}")


def trips(d):
    out = {}
    for _, el in ET.iterparse(os.path.join(d, "tripinfo.xml")):
        if el.tag == "tripinfo":
            dep = float(el.get("depart"))
            if t0 <= dep < t1:
                out[el.get("id")] = (float(el.get("duration")), float(el.get("routeLength")))
            el.clear()
    return out


def drove_block(d, closed):
    """Trips departing in the hour whose last route in this run used the closed block."""
    ids = set()
    for _, el in ET.iterparse(os.path.join(d, "vehroute.xml")):
        if el.tag == "vehicle":
            r = el.find("route")
            if t0 <= float(el.get("depart")) < t1 and r is not None and closed & set(r.get("edges").split()):
                ids.add(el.get("id"))
            el.clear()
    return ids


def max_jam(d):
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


closed_edges = set(json.load(open(os.path.join(WORK, "demand_summary.json")))["closed_edges"])
# Trips whose planned route used the closed block (written by 03_demand.py). These are the diversions.
# (Counting cars that drove the block in the base run gives more, because SUMO's live rerouting also
# sends cars through it as a shortcut around jams elsewhere. That is an artifact, so it is only reported.)
affected = {el.get("id") for el in ET.parse(os.path.join(WORK, "affected.trips.xml")).getroot().iter("trip")}

per_seed, detours = [], []
for seed in args.seeds:
    b, c = run_dir("base", seed), run_dir("closure", seed)
    tb, tc = trips(b), trips(c)
    both = tb.keys() & tc.keys()
    # Diverted: drove the closed block in the normal run, so had to go another way with the closure.
    users = drove_block(b, closed_edges)
    hit = [v for v in both if v in affected]
    delay_all = sum(tc[v][0] - tb[v][0] for v in both) / 3600
    delay_hit = sum(tc[v][0] - tb[v][0] for v in hit) / 3600
    detours += [tc[v][1] - tb[v][1] for v in hit]
    jb, jc = max_jam(b), max_jam(c)
    growth = {lane: jc.get(lane, 0) - jb.get(lane, 0) for lane in jc}
    worst_lane = max(growth, key=growth.get) if growth else None
    per_seed.append(dict(
        seed=seed, trips_in_hour_base=len(tb), trips_in_hour_closure=len(tc), matched=len(both),
        diverted=len([v for v in tc if v in affected]), drove_block_in_base_run=len(users),
        delay_veh_h_all=round(delay_all, 1), delay_veh_h_diverted=round(delay_hit, 1),
        delay_veh_h_others=round(delay_all - delay_hit, 1),
        max_queue_growth_m=round(growth[worst_lane], 1) if worst_lane else 0, worst_lane=worst_lane,
        max_queue_closure_m=round(max(jc.values()), 1) if jc else 0,
        teleports_base=teleports(b), teleports_closure=teleports(c)))


def rng(key, unit):
    vals = sorted(s[key] for s in per_seed)
    return {"low": round(vals[0]), "typical": round(statistics.median(vals)), "high": round(vals[-1]), "unit": unit}


# Detour: extra length of the shortest route around the closure for each diverted trip (03_demand.py),
# which depends only on the street network. The simulated distances are noisier because of live rerouting.
static = json.load(open(os.path.join(WORK, "demand_summary.json")))["static_detour_m"]["sorted"]  # every 5%
pick = lambda p: round(static[min(len(static) - 1, round(p * (len(static) - 1)))])
detour = {"low": pick(0.25), "typical": pick(0.5), "high": pick(0.75), "unit": "m"}
detours.sort()
delay, diverted, queue = rng("delay_veh_h_all", "vehicle-hours"), rng("diverted", "vehicles"), rng("max_queue_growth_m", "m")
# Diverted trips scale with traffic, so report them at full counts. Delay and queue don't scale simply, so they stay as simulated.
diverted = {k: (round(v / args.scale) if k != "unit" else v) for k, v in diverted.items()}
noisy = delay["low"] < 0 <= delay["high"] or delay["high"] < 0
delay_text = ("The change in total travel time is too small to separate from run-to-run variation."
              if noisy else f"Total extra travel time is about {delay['typical']:,} vehicle-hours.")
hour_label = f"{args.hour % 12 or 12}{'am' if args.hour < 12 else 'pm'} to {(args.hour + 1) % 12 or 12}{'am' if args.hour + 1 < 12 else 'pm'}"
demand = json.load(open(os.path.join(WORK, "demand_summary.json")))
tele = max(s["teleports_closure"] for s in per_seed)

result = {
    "model": "sumo",
    "method": "SUMO traffic simulation",
    "label": "Early result",
    "provenance": "precomputed",
    "confidence": "low",
    "confidence_note": "The street network comes from OpenStreetMap with guessed signal timings, and traffic is fitted to signal counts, not measured routes.",
    "period": f"Monday {hour_label}, the morning peak",
    "recommended_window": None,
    "modes": {
        "cars": {
            "status": "modelled",
            "delay": delay, "max_queue": queue, "forced_diversions": diverted, "detour": detour,
            "summary": f"In the morning peak hour about {diverted['typical']:,} drivers must avoid the closed block, "
                       f"adding about {detour['typical']:,} m each. {delay_text}",
        },
        "public_transport": {"status": "not modelled", "summary": "Trams are in the street network but no tram services were simulated."},
        "pedestrians": {"status": "not modelled", "summary": "SUMO can model pedestrians, but this run covers cars only."},
        "trucks": {"status": "not modelled", "summary": "All vehicles are simulated as cars. Trucks are not modelled on their own."},
    },
    "assumptions": [
        f"One simulated hour, {hour_label} on a weekday, after a 30 minute warm-up. Other hours of the works were not simulated.",
        "Street network from OpenStreetMap (© OpenStreetMap contributors), built with SUMO netconvert. Signal timings are guessed, not the real SCATS plans.",
        f"Traffic fitted to weekday counts at {len(demand['counting_sites'])} SCATS signal sites in the CBD, including 2921 SWANSTON/LATROBE, using SUMO routeSampler and the SCATS weekday hourly profile."
        + (f" Only {args.scale:.0%} of that traffic was inserted, because the simulated network jams above that (70% already grows without limit). Diversions are scaled back up to full traffic. Delay and queue are as simulated, so they are likely understated." if args.scale != 1 else ""),
        f"Closure: the car lane of Swanston St between La Trobe St and Little La Trobe St ({', '.join(demand['closed_edges'])}) is closed to all vehicles. The rest of that block is tram only in OpenStreetMap.",
        f"Drivers whose route used the closed block get a new shortest route before they leave, and every car can reroute every 5 minutes. {demand['removed_destination_cut_off_by_closure']:,} trips of {demand['sampled_trips']:,} ended at a place the closure cuts off and were removed from both runs.",
        "Delay is the extra travel time of the same trips with and without the closure, over all trips in the hour. Negative values mean the closure run happened to flow better, which is run-to-run variation.",
        "Queue is the largest growth in jam length on any lane within 600 m. The worst lane differs between seeds, so part of it is variation too.",
        f"In OpenStreetMap the closed block is tram only apart from one northbound car lane, so few cars use it: about {round(statistics.median(s['diverted'] for s in per_seed) / args.scale):,} an hour at full traffic.",
        f"Ranges come from {len(args.seeds)} random seeds (delay, diversions, queue). The detour range is the middle half of the shortest-route detours of the diverted trips.",
        "Diversions count trips whose planned route used the closed block. SUMO's live rerouting also sent some cars through the block as a shortcut in the normal run; those are not counted.",
        f"Cars stuck for 5 minutes are moved on by SUMO (teleported). Up to {tele:,} teleports in a closure run, which points to congestion the real network may not have.",
        "Trams keep running in reality, but no tram services were simulated, so tram delays are not included.",
    ],
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
os.makedirs(OUT, exist_ok=True)
json.dump(result, open(os.path.join(OUT, "swanston.json"), "w"), indent=2, ensure_ascii=False)
json.dump(dict(hour=args.hour, scale=args.scale, per_seed=per_seed, detour_m_quartiles=detour,
               n_diverted_trips_matched=len(detours)), open(os.path.join(OUT, "summary.json"), "w"), indent=2)
print(json.dumps(per_seed, indent=1))
print("cars:", json.dumps(result["modes"]["cars"], indent=1))
