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

def entered_block(d):
    """Cars entering the closed block in the base run during the hour (edgedata covers exactly the hour)."""
    return sum(float(e.get("entered", 0)) for e in ET.parse(os.path.join(d, "edgedata.xml")).getroot().iter("edge")
               if e.get("id") in closed_edges)


per_seed, detours, jams = [], [], []
for seed in args.seeds:
    b, c = run_dir("base", seed), run_dir("closure", seed)
    tb, tc = trips(b), trips(c)
    both = tb.keys() & tc.keys()
    users = drove_block(b, closed_edges)
    hit = [v for v in both if v in affected]
    delay_all = sum(tc[v][0] - tb[v][0] for v in both) / 3600
    delay_hit = sum(tc[v][0] - tb[v][0] for v in hit) / 3600
    detours += [tc[v][1] - tb[v][1] for v in hit]
    jb, jc = max_jam(b), max_jam(c)
    jams.append(jb)
    growth = {lane: jc.get(lane, 0) - jb.get(lane, 0) for lane in jc}
    worst_lane = max(growth, key=growth.get) if growth else None
    per_seed.append(dict(
        seed=seed, trips_in_hour_base=len(tb), trips_in_hour_closure=len(tc), matched=len(both),
        diverted_completed=len([v for v in tc if v in affected]), drove_block_in_base_run=len(users),
        entered_block_in_base_run=entered_block(b),
        delay_veh_h_all=round(delay_all, 1), delay_veh_h_diverted=round(delay_hit, 1),
        delay_veh_h_others=round(delay_all - delay_hit, 1),
        max_queue_growth_m=round(growth[worst_lane], 1) if worst_lane else 0, worst_lane=worst_lane,
        teleports_base=teleports(b), teleports_closure=teleports(c)))


def rng(key, unit):
    vals = sorted(s[key] for s in per_seed)
    return {"low": round(vals[0]), "typical": round(statistics.median(vals)), "high": round(vals[-1]), "unit": unit}


delay = rng("delay_veh_h_all", "vehicle-hours")

# Diversions. No counter measures the closed lane, so give the spread of what the runs support:
#   low      diverted trips that completed, scaled from --scale to full traffic
#   typical  trips in the hour whose planned route used the block (full demand, no scaling)
#   high     most cars entering the block in any base run, scaled to full traffic
# (--scale keeps the same share of cars in every seed, so the completed count barely varies.)
planned = sum(1 for el in ET.parse(os.path.join(WORK, "affected.trips.xml")).getroot().iter("trip") if t0 <= float(el.get("depart")) < t1)
div_vals = sorted([round(min(s["diverted_completed"] for s in per_seed) / args.scale), planned,
                   round(max(s["entered_block_in_base_run"] for s in per_seed) / args.scale)])
diverted = {"low": div_vals[0], "typical": div_vals[1], "high": div_vals[2], "unit": "vehicles"}

# Detour. Low is the shortest-distance detour on the closed network (the block, A'Beckett St, La Trobe St
# and Elizabeth St form a rectangle, so it is tiny). Typical and high are what the simulated trips drove:
# the median and upper quartile. duarouter picks the fastest route, and Little La Trobe St is a 20 km/h
# living street, so the fastest detour is longer than the shortest one.
net_full, net_closed = load_net(), sumolib.net.readNet(os.path.join(WORK, "net_closed.net.xml"))
short = []
for el in ET.parse(os.path.join(WORK, "affected.trips.xml")).getroot().iter("trip"):
    if t0 <= float(el.get("depart")) < t1:
        f, t = el.get("from"), el.get("to")
        a = net_full.getShortestPath(net_full.getEdge(f), net_full.getEdge(t), vClass="passenger")
        c = net_closed.getShortestPath(net_closed.getEdge(f), net_closed.getEdge(t), vClass="passenger")
        if a[0] and c[0]:
            short.append(c[1] - a[1])
detours.sort()
q = lambda xs, p: round(xs[min(len(xs) - 1, int(p * len(xs)))]) if xs else 0
detour = {"low": round(statistics.median(short)) if short else 0, "typical": q(detours, 0.5), "high": q(detours, 0.75), "unit": "m"}

# Queue. The biggest jam growth on any lane is no bigger than the difference between two base runs,
# so no queue result is reported.
noise = [round(max(jams[i + 1].get(l, 0) - v for l, v in jams[i].items())) for i in range(len(jams) - 1)]
hour_label = f"{args.hour % 12 or 12}{'am' if args.hour < 12 else 'pm'} to {(args.hour + 1) % 12 or 12}{'am' if args.hour + 1 < 12 else 'pm'}"
demand = json.load(open(os.path.join(WORK, "demand_summary.json")))
tele = max(s["teleports_closure"] for s in per_seed)
noisy = delay["low"] < 0 <= delay["high"] or delay["high"] < 0
delay_text = ("The change in total travel time is too small to separate from run-to-run variation."
              if noisy else f"Total extra travel time is about {delay['typical']:,} vehicle-hours.")

result = {
    "model": "sumo",
    "method": "SUMO traffic simulation",
    "label": "Early result",
    "provenance": "precomputed",
    "confidence": "low",
    "confidence_note": "The street network comes from OpenStreetMap with guessed signal timings, traffic is fitted to signal counts rather than measured routes, and no counter measures the closed lane.",
    "period": f"Monday {hour_label}, the morning peak",
    "recommended_window": None,
    "modes": {
        "cars": {
            "status": "modelled",
            "delay": delay, "forced_diversions": diverted, "detour": detour,
            "summary": f"In the morning peak, tens to about a hundred drivers an hour must avoid the closed block. "
                       f"Most detour about one block, depending on route choice. {delay_text}",
        },
        "public_transport": {"status": "not modelled", "summary": "Trams are in the street network but no tram services were simulated."},
        "pedestrians": {"status": "not modelled", "summary": "SUMO can model pedestrians, but this run covers cars only."},
        "trucks": {"status": "not modelled", "summary": "All vehicles are simulated as cars. Trucks are not modelled on their own."},
    },
    "assumptions": [
        f"One simulated hour, {hour_label} on a weekday, after a 30 minute warm-up. Other hours of the works were not simulated.",
        "Street network from OpenStreetMap (© OpenStreetMap contributors), built with SUMO netconvert. Signal timings are guessed, not the real SCATS plans.",
        f"Traffic fitted to weekday counts at {len(demand['counting_sites'])} SCATS signal sites in the CBD, including 2921 SWANSTON/LATROBE, using SUMO routeSampler and the SCATS weekday hourly profile.",
        (f"Only {args.scale:.0%} of that traffic was inserted. The counts are whole-intersection totals, and at site 2921 they all land on the two La Trobe St approaches, because both Swanston St approaches are tram only. "
         "OpenStreetMap codes the eastbound approach as one lane, so it can't carry its share. The run therefore carries less than the counted traffic at this junction, and some cars never enter the network. Delay is likely understated.") if args.scale != 1 else
        "Counts are whole-intersection totals, split across each junction's car approaches by lane count.",
        f"Closure: the only car lane on Swanston St between La Trobe St and Little La Trobe St ({', '.join(demand['closed_edges'])}, northbound) is closed. The rest of the block is tram only in OpenStreetMap, as on the street.",
        "That lane is the only car entry to Little La Trobe St and the east end of A'Beckett St, so the closure cuts car access to them. Trips ending there were removed from both runs rather than counted.",
        f"Diversions: no counter measures the closed lane, so the range spans what the runs support: completed diverted trips, trips planned through the block, and the most cars entering it in a normal run (the last two scaled to full traffic).",
        "Detour: the shortest way round is only a few metres, because nearby streets form a loop. The typical and high values are what simulated drivers actually drove, with live rerouting.",
        f"Delay is the extra travel time of the same trips with and without the closure, over all trips in the hour, across {len(args.seeds)} random seeds. Negative values mean the closure run happened to flow better.",
        f"Queue growth could not be separated from run-to-run variation. Normal runs differ from each other by {min(noise)} to {max(noise)} m on their worst lane, so no queue is reported.",
        f"Cars stuck for 5 minutes are moved on by SUMO (teleported). Up to {tele:,} teleports in a closure run.",
        "Trams keep running in reality, but no tram services were simulated, so tram delays are not included.",
    ],
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
os.makedirs(OUT, exist_ok=True)
json.dump(result, open(os.path.join(OUT, "swanston.json"), "w"), indent=2, ensure_ascii=False)
json.dump(dict(hour=args.hour, scale=args.scale, per_seed=per_seed, diversions=diverted, planned_in_hour=planned,
               detour_m=detour, shortest_detours_m=sorted(round(x) for x in short), simulated_detour_quartiles_m=[q(detours, 0.25), q(detours, 0.5), q(detours, 0.75)],
               n_diverted_trips_matched=len(detours), base_vs_base_worst_lane_m=noise), open(os.path.join(OUT, "summary.json"), "w"), indent=2)
print(json.dumps(per_seed, indent=1))
print("cars:", json.dumps(result["modes"]["cars"], indent=1))
