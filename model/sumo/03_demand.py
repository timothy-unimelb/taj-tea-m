#!/usr/bin/env python3
"""Build one demand file that both scenarios share.

1. Candidate routes: random trips over the whole network, routed by duarouter (with a little
   random routing noise so there are alternatives).
2. Counts: where a DTP signal sheet has been read (detector_approaches.json, 00_detector_counts.py),
   car stop-line detector counts per approach, hour by hour. Other sites: the whole-site SCATS weekday
   volume, corrected to cars only by the median share found at the measured sites, x the weekday hourly
   share, split over the car approach edges of the junction by lane count (README, assumptions).
3. routeSampler picks routes from the pool so simulated edge counts match the targets, hour by hour.
4. Trips that start or end inside the closed block are removed from BOTH scenarios and counted.
5. The closure scenario re-routes only the trips whose route used the closed edge (duarouter on the
   closed network). All other trips keep the same route as the base scenario.
"""
import argparse, json, math, os, random, re, subprocess, sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--pool", type=int, default=120000, help="candidate random trips")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--min-site-daily", type=float, default=0, help="ignore SCATS sites with fewer daily vehicles")
ap.add_argument("--max-node-dist", type=float, default=45.0, help="metres from SCATS site to junction")
ap.add_argument("--edge-margin", type=float, default=120.0, help="ignore sites this close (m) to the network edge")
ap.add_argument("--scale", type=float, default=1.0, help="multiply all SCATS counts (sensitivity test)")
ap.add_argument("--tag", default="", help="suffix for output files")
ap.add_argument("--site-totals", action="store_true", help="use whole-site SCATS totals everywhere (the old method)")
ap.add_argument("--min-lane-daily", type=float, default=600.0,
                help="skip an unmeasured site whose car total split over its approach lanes gives fewer cars per lane a day than this")
args = ap.parse_args()
T = args.tag


def w(name):
    return os.path.join(WORK, name + T)


net = load_net()
closed_ids, junction = find_closed_edges(net)
print("closed edges:", closed_ids)
closed = set(closed_ids)

# ---- reachability: which edges are cut off by the closure --------------------------------------
seed_edge = net.getEdge("279989319")  # La Trobe St, a well connected edge
base_scc = reach(seed_edge) & reach(seed_edge, False)
clo_fwd = reach(seed_edge, True, closed)
clo_bwd = reach(seed_edge, False, closed)
clo_scc = clo_fwd & clo_bwd
cutoff_dest = {e.getID() for e in base_scc if e not in clo_fwd and e.getID() not in closed}
cutoff_orig = {e.getID() for e in base_scc if e not in clo_bwd and e.getID() not in closed}
print("edges unreachable after closure (destinations):", sorted(cutoff_dest))
print("edges that cannot leave after closure (origins):", sorted(cutoff_orig))
scc_ids = {e.getID() for e in base_scc}

# ---- counting sites -> junction approaches ----------------------------------------------------
share = hourly_share()
sites = scats_sites()
minx, miny, maxx, maxy = min_max = None, None, None, None
xs = [p[0] for e in base_scc for p in e.getShape()]
ys = [p[1] for e in base_scc for p in e.getShape()]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
# Approaches of a counting site: every car edge that ends within --max-node-dist of the site and starts outside
# that radius (or enters the network there). Not "the edges into the nearest junction": netconvert leaves some
# divided junctions as several nodes, and an edge that enters the network at its cut edge is not in the strongly
# connected component, so until 30 Sep 9am a boundary site could put its whole total on one interior approach.
# Car counts per approach where a DTP signal sheet has been read (00_detector_counts.py). Other sites use
# the whole-site total, corrected by the median car share found at the measured sites.
ac_path = os.path.join(WORK, "approach_counts.json")
ac = None if args.site_totals or not os.path.exists(ac_path) else json.load(open(ac_path))
car_share = ac["car_share_of_site_total"] if ac else 1.0
spec = json.load(open(os.path.join(HERE, "detector_approaches.json")))["sites"] if ac else {}
print("counts:", f"detector level where mapped, other sites x {car_share:.2f}" if ac else "whole-site totals")

in_ids = {e.getID() for e in reach(seed_edge, False)}  # edges from which La Trobe St can be reached
lonmin, latmin, lonmax, latmax = BBOX
site_edges = {}
skipped = []
for s in sites:
    if s["type"] != "INT":
        continue
    if not (lonmin <= s["lon"] <= lonmax and latmin <= s["lat"] <= latmax):
        continue
    if s["daily"] < args.min_site_daily:
        continue
    x, y = net.convertLonLat2XY(s["lon"], s["lat"])
    if x < minx + args.edge_margin or x > maxx - args.edge_margin or y < miny + args.edge_margin or y > maxy - args.edge_margin:
        skipped.append((s["site_no"], s["name"], "near network edge"))
        continue
    eds = []
    for e in net.getEdges():
        if not e.allows("passenger") or e.getID() not in in_ids:
            continue
        (sx, sy), (ex, ey) = e.getShape()[0], e.getShape()[-1]
        if math.hypot(ex - x, ey - y) <= args.max_node_dist and (math.hypot(sx - x, sy - y) > args.max_node_dist or not e.getIncoming()):
            eds.append(e)
    if not eds:
        skipped.append((s["site_no"], s["name"], f"no car approach within {args.max_node_dist:.0f} m"))
        continue
    if len(eds) < 3 and not (ac and str(s["site_no"]) in ac["sites"]):
        # a whole-site total needs the whole junction: where the cross street is tram-only (Swanston St) or
        # cut, the total would land on the one street that is left
        skipped.append((s["site_no"], s["name"], f"only {len(eds)} car approaches in the network for a whole-site total"))
        continue
    site_edges[s["site_no"]] = (s, eds)


def approach_weights(eds):
    """Car approach edges and their share of the site total, by lane count (of the wider edge upstream if wider)."""
    ws = {}
    for e in eds:
        lanes = len([l for l in e.getLanes() if l.allows("passenger")])
        preds = [p for p in e.getIncoming() if p.allows("passenger") and p.getName() == e.getName()]
        lanes = max([lanes] + [len([l for l in p.getLanes() if l.allows("passenger")]) for p in preds])
        ws[e.getID()] = lanes
    tot = sum(ws.values())
    return {k: v / tot for k, v in ws.items()} if tot else {}



targets = defaultdict(lambda: defaultdict(float))  # hour -> edge -> count
site_rows, unmatched = [], []
for site_no, (s, eds) in site_edges.items():
    ss = [s]
    aw = approach_weights(eds)
    if not aw:
        continue
    measured = [s for s in ss if ac and str(s["site_no"]) in ac["sites"]]
    rest = [s for s in ss if s not in measured]
    daily = sum(s["daily"] for s in rest) * car_share
    lanes_total = sum(len([l for l in e.getLanes() if l.allows("passenger")]) for e in eds)
    if not measured and daily / lanes_total < args.min_lane_daily:
        # A site total this small at a CBD junction means only the side street has detectors (the sheets for
        # 2906 and 4512 show Elizabeth St with none). Splitting it would starve the main street, so leave the
        # site unconstrained.
        skipped.append((s["site_no"], s["name"], f"site total gives {daily / lanes_total:.0f} cars per lane a day: main street probably has no detectors"))
        continue
    row = dict(node=sorted({e.getToNode().getID() for e in eds}), sites=[(s["site_no"], s["name"]) for s in ss], daily=daily, approaches=aw)
    for s in measured:
        counts = ac["sites"][str(s["site_no"])]["approaches"]
        for d in spec[str(s["site_no"])].get("no_car_approaches", []):
            counts = {**counts, d: [0] * 24}  # the sheet shows no car lane: tell routeSampler to keep cars off
        for d, hourly in counts.items():
            eds = [e for e in aw if direction(net.getEdge(e)) == d]
            if not eds:
                unmatched.append((s["site_no"], d, round(sum(hourly))))
                continue
            lanes = {e: len([l for l in net.getEdge(e).getLanes() if l.allows("passenger")]) for e in eds}
            for h in range(SIM_START_H, SIM_END_H):
                for e in eds:
                    targets[h][e] += hourly[h] * lanes[e] / sum(lanes.values()) * args.scale
        row["daily"] += ac["sites"][str(s["site_no"])]["car_daily"]
        row["measured"] = True
    site_rows.append(row)
    for h in range(SIM_START_H, SIM_END_H):
        for eid, f in aw.items():
            if daily:
                targets[h][eid] += daily * share[h] * f * args.scale
if unmatched:
    print("counted approaches with no car edge in the network (site, direction, vehicles/day):", unmatched)
print(f"{len(site_rows)} junctions with SCATS counts, {len(skipped)} sites skipped:", skipped)
few = [(r["sites"][0][1], len(r["approaches"])) for r in site_rows if not r.get("measured") and len(r["approaches"]) < 3]
print("unmeasured sites with fewer than 3 car approaches in the network (their total is split over what is there):", few)
tot_site = {h: sum(v.values()) for h, v in targets.items()}

# ---- edgedata file with hourly counts ---------------------------------------------------------
root = ET.Element("data")
for h in range(SIM_START_H, SIM_END_H):
    iv = ET.SubElement(root, "interval", begin=str((h - SIM_START_H) * 3600), end=str((h - SIM_START_H + 1) * 3600))
    for eid, c in sorted(targets[h].items()):
        ET.SubElement(iv, "edge", id=eid, entered=f"{c:.2f}")
ET.ElementTree(root).write(w("counts.xml"))

# ---- candidate routes -------------------------------------------------------------------------
rt = os.path.join(os.environ["SUMO_HOME"], "tools", "randomTrips.py")
if not os.path.exists(w("pool.rou.xml")):
    subprocess.check_call([sys.executable, rt, "-n", NET, "-o", w("pool.trips.xml"), "-r", w("pool.rou.xml"),
                           "-e", str(args.pool), "-p", "1", "-s", str(args.seed), "--vehicle-class", "passenger",
                           "--edge-permission", "passenger", "--validate", "--fringe-factor", "3",
                           "--min-distance", "300", "-l", "-L", "--random-routing-factor", "2",
                           "--remove-loops", "--random-departpos", "--random-arrivalpos",
                           "--prefix", "p", "--error-log", w("pool.errors.txt")],
                          stdout=subprocess.DEVNULL)

# ---- sample routes to match counts ------------------------------------------------------------
rs = os.path.join(os.environ["SUMO_HOME"], "tools", "routeSampler.py")
sampler = subprocess.run([sys.executable, rs, "-r", w("pool.rou.xml"), "-d", w("counts.xml"),
                       "--edgedata-attribute", "entered", "-o", w("sampled.rou.xml"), "--prefix", "v",
                       "--optimize", "full", "--weighted", "-s", str(args.seed), "--min-count", "1",
                       "--mismatch-output", w("mismatch.xml"), "--geh-ok", "5",
                       "-a", 'departLane="best" departSpeed="max"',
                       "-b", "0", "-e", str((SIM_END_H - SIM_START_H) * 3600)], capture_output=True, text=True, check=True)
print(sampler.stdout)
# share of counted edges within GEH 5 (a standard fit test for traffic counts), worst hour
geh_ok = min(float(x) for x in re.findall(r"GEH<5.0 for ([\d.]+)%", sampler.stdout)) if "GEH<5.0" in sampler.stdout else None

# ---- filter trips that start/end inside the closed block; write base + closure demand --------
tree = ET.parse(w("sampled.rou.xml"))
vehs = []
for v in tree.getroot().iter("vehicle"):
    r = v.find("route")
    edges = r.get("edges").split()
    vehs.append((float(v.get("depart")), v.get("id"), edges))
vehs.sort()
n_all = len(vehs)
rm_orig_closed = rm_dest_closed = rm_dest_cut = 0
kept = []
for dep, vid, edges in vehs:
    if edges[0] in closed:
        rm_orig_closed += 1
        continue
    if edges[-1] in closed:
        rm_dest_closed += 1
        continue
    if edges[-1] in cutoff_dest:
        rm_dest_cut += 1
        continue
    kept.append((dep, vid, edges))
print(f"{n_all} sampled trips, removed {n_all - len(kept)}")

base = ET.Element("routes")
ET.SubElement(base, "vType", id="car", vClass="passenger", length="4.8", minGap="2.0", accel="2.6", decel="4.5",
              sigma="0.5", tau="1.0", speedFactor="normc(1,0.1,0.8,1.2)")
using = []
for dep, vid, edges in kept:
    v = ET.SubElement(base, "vehicle", id=vid, type="car", depart=f"{dep:.1f}", departLane="best", departSpeed="max",
                      departPos="random_free")
    ET.SubElement(v, "route", edges=" ".join(edges))
    if any(e in closed for e in edges):
        using.append(vid)
ET.ElementTree(base).write(w("base.rou.xml"))
print(f"{len(using)} of {len(kept)} kept trips use the closed block in their base route")

# closure: reroute only the affected trips on the closed network
closed_net = os.path.join(WORK, "net_closed.net.xml")
import re
txt = open(NET, encoding="utf8").read()
for cid in closed_ids:
    # make every lane of the closed edge unusable for vehicles (trams are not on these edges)
    def fix(m):
        blk = re.sub(r' (dis)?allow="[^"]*"', "", m.group(0))
        return blk.replace("<lane ", '<lane disallow="all" ')
    txt = re.sub(r'<edge id="%s"[^>]*>.*?</edge>' % re.escape(cid), fix, txt, flags=re.S)
open(closed_net, "w", encoding="utf8").write(txt)

trips = ET.Element("routes")
ET.SubElement(trips, "vType", id="car", vClass="passenger", length="4.8", minGap="2.0", accel="2.6", decel="4.5",
              sigma="0.5", tau="1.0", speedFactor="normc(1,0.1,0.8,1.2)")
kept_by_id = {vid: (dep, edges) for dep, vid, edges in kept}
for vid in using:
    dep, edges = kept_by_id[vid]
    ET.SubElement(trips, "trip", id=vid, type="car", depart=f"{dep:.1f}", departLane="best", departSpeed="max",
                  departPos="random_free", **{"from": edges[0], "to": edges[-1]})
ET.ElementTree(trips).write(w("affected.trips.xml"))
subprocess.check_call(["duarouter", "-n", closed_net, "--route-files", w("affected.trips.xml"), "-o", w("affected.rou.xml"),
                       "--ignore-errors", "--no-warnings", "--repair", "false", "--no-step-log"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
rer = {}
for v in ET.parse(w("affected.rou.xml")).getroot().iter("vehicle"):
    rer[v.get("id")] = v.find("route").get("edges").split()
lost = [v for v in using if v not in rer]
print(f"{len(rer)} rerouted, {len(lost)} could not be rerouted (removed from both scenarios)")

# rewrite base without unroutable trips, and closure with reroutes
lost = set(lost)
kept2 = [(d, i, e) for d, i, e in kept if i not in lost]
for name, mapping in (("base", None), ("closure", rer)):
    r = ET.Element("routes")
    ET.SubElement(r, "vType", id="car", vClass="passenger", length="4.8", minGap="2.0", accel="2.6", decel="4.5",
                  sigma="0.5", tau="1.0", speedFactor="normc(1,0.1,0.8,1.2)")
    for dep, vid, edges in kept2:
        e2 = mapping[vid] if mapping and vid in mapping else edges
        v = ET.SubElement(r, "vehicle", id=vid, type="car", depart=f"{dep:.1f}", departLane="best", departSpeed="max",
                          departPos="random_free")
        ET.SubElement(v, "route", edges=" ".join(e2))
    ET.ElementTree(r).write(w(name + ".rou.xml"))

# static detour length (shortest path on closed net vs original route) for affected trips
def route_len(edges):
    return sum(net.getEdge(e).getLength() for e in edges)

detours = [route_len(rer[v]) - route_len(kept_by_id[v][1]) for v in using if v in rer]
summary = dict(
    sampled_trips=n_all,
    removed_origin_in_closed_block=rm_orig_closed,
    removed_destination_in_closed_block=rm_dest_closed,
    removed_destination_cut_off_by_closure=rm_dest_cut,
    removed_unroutable_after_closure=len(lost),
    kept_trips=len(kept2),
    trips_using_closed_block_in_base_route=len(using),
    closed_edges=closed_ids,
    cutoff_destination_edges=sorted(cutoff_dest),
    counting_junctions=len(site_rows),
    count_method="detector level where mapped" if ac else "whole-site totals",
    measured_sites=sorted(int(k) for k in (ac or {}).get("sites", {})),
    car_share_of_site_total=car_share,
    counted_approaches_without_car_edge=unmatched,
    geh_ok_share_worst_hour=geh_ok,
    counting_sites=sorted({s[0] for r in site_rows for s in r["sites"]}),
    skipped_sites=skipped,
    target_vehicles_per_hour_sum_over_approaches={h: round(v) for h, v in tot_site.items()},
    static_detour_m=dict(n=len(detours), mean=sum(detours) / max(1, len(detours)),
                         sorted=sorted(detours)[::max(1, len(detours) // 20)] if detours else []),
    hourly_share_used={h: share[h] for h in range(SIM_START_H, SIM_END_H)},
)
json.dump(summary, open(w("demand_summary.json"), "w"), indent=1, default=str)
json.dump(site_rows, open(w("site_targets.json"), "w"), indent=1)
print(json.dumps({k: v for k, v in summary.items() if k not in ("skipped_sites", "hourly_share_used")}, indent=1, default=str)[:2500])
