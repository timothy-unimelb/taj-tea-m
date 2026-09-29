#!/usr/bin/env python3
"""Calibration check: what the simulation actually carried on each counted edge, against the counts.

    python3 08_check_counts.py --hours $(seq 7 21) --seeds 1 2 3 4 5

routeSampler (03_demand.py) fits the routes to the counts before simulating. This checks the simulation itself:
for every counted edge and hour, the cars that entered the edge in the normal (base) runs, averaged over seeds,
against the count target (work/counts.xml), as GEH = sqrt(2 (m - c)^2 / (m + c)). GEH under 5 is the usual pass
mark for a modelled link. Also reports the health of each hour: share of cars dropped because they could not
enter within 5 minutes, teleports, and mean speed against the speed limit.
Writes output/calibration.json. PLAN.md step 6b item 4 says when this passes.
"""
import argparse, json, math, os, re, statistics, xml.etree.ElementTree as ET
from collections import defaultdict
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--hours", type=int, nargs="+", default=list(range(7, 22)))
ap.add_argument("--seeds", type=int, nargs="+", default=[1])
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--worst", type=int, default=12, help="how many worst edges to list")
args = ap.parse_args()

net = load_net()
targets = {}  # hour -> edge -> count
for iv in ET.parse(os.path.join(WORK, "counts.xml")).getroot().iter("interval"):
    h = int(float(iv.get("begin")) // 3600) + SIM_START_H
    targets[h] = {e.get("id"): float(e.get("entered")) for e in iv.iter("edge")}
edge_site = {}
for r in json.load(open(os.path.join(WORK, "site_targets.json"))):
    for e in r["approaches"]:
        edge_site[e] = ", ".join(s[1] for s in r["sites"])


def run_dir(seed, hour):
    return os.path.join(WORK, "runs", f"base_h{hour}_x{args.scale:g}_s{seed}")


def entered(d):
    """Cars that used the edge in the hour: entered from upstream plus those that started on it (SUMO counts
    them separately; the count targets and routeSampler count both)."""
    return {e.get("id"): float(e.get("entered", 0)) + float(e.get("departed", 0))
            for e in ET.parse(os.path.join(d, "edgedata.xml")).getroot().iter("edge")}


def health(d, hour):
    t0, t1 = (hour - SIM_START_H) * 3600, (hour - SIM_START_H + 1) * 3600
    txt = open(os.path.join(d, "summary.xml")).read()
    steps = re.findall(r'<step time="([\d.]+)"[^>]*loaded="(\d+)"[^>]*teleports="(\d+)"[^>]*meanSpeed="([\d.]+)" meanSpeedRelative="([\d.]+)" discarded="(\d+)"', txt)
    inh = [s for s in steps if t0 <= float(s[0]) < t1]
    last = steps[-1]
    return dict(dropped=int(last[5]) / int(last[1]), teleports=int(last[2]),
                mean_speed_kmh=statistics.mean(float(s[3]) for s in inh) * 3.6, speed_relative=statistics.mean(float(s[4]) for s in inh))


def geh(m, c):
    return math.sqrt(2 * (m - c) ** 2 / (m + c)) if m + c > 0 else 0.0


rows, per_hour = [], {}
for h in args.hours:
    sims = [entered(run_dir(s, h)) for s in args.seeds]
    hs = [health(run_dir(s, h), h) for s in args.seeds]
    gehs = []
    for eid, c in targets[h].items():
        m = statistics.mean(sim.get(eid, 0.0) for sim in sims) / args.scale
        g = geh(m, c)
        gehs.append(g)
        rows.append(dict(hour=h, edge=eid, street=net.getEdge(eid).getName() if net.hasEdge(eid) else "?", site=edge_site.get(eid, ""),
                         count=round(c), simulated=round(m), geh=round(g, 1)))
    per_hour[h] = dict(counted_edges=len(gehs), geh_under_5=round(sum(g < 5 for g in gehs) / len(gehs), 3),
                       geh_under_10=round(sum(g < 10 for g in gehs) / len(gehs), 3), mean_geh=round(statistics.mean(gehs), 2),
                       count_total=round(sum(targets[h].values())),
                       simulated_total=round(sum(statistics.mean(sim.get(e, 0.0) for sim in sims) for e in targets[h]) / args.scale),
                       dropped=round(max(x["dropped"] for x in hs), 3), teleports=max(x["teleports"] for x in hs),
                       mean_speed_kmh=round(statistics.mean(x["mean_speed_kmh"] for x in hs), 1),
                       speed_relative=round(statistics.mean(x["speed_relative"] for x in hs), 2))

allg = [r["geh"] for r in rows]
overall = dict(hours=args.hours, seeds=args.seeds, edge_hours=len(rows),
               geh_under_5=round(sum(g < 5 for g in allg) / len(allg), 3), geh_under_10=round(sum(g < 10 for g in allg) / len(allg), 3),
               mean_geh=round(statistics.mean(allg), 2), worst_hour_geh_under_5=min(v["geh_under_5"] for v in per_hour.values()),
               max_dropped=max(v["dropped"] for v in per_hour.values()), max_teleports=max(v["teleports"] for v in per_hour.values()),
               mean_speed_kmh=round(statistics.mean(v["mean_speed_kmh"] for v in per_hour.values()), 1),
               min_speed_relative=min(v["speed_relative"] for v in per_hour.values()))
# edges that fail in most hours, ranked by how much traffic is missing or extra
by_edge = defaultdict(list)
for r in rows:
    by_edge[r["edge"]].append(r)
worst = sorted(by_edge.values(), key=lambda rs: -sum(abs(r["simulated"] - r["count"]) for r in rs))[:args.worst]
worst_edges = [dict(edge=rs[0]["edge"], street=rs[0]["street"], site=rs[0]["site"], hours_failing=sum(r["geh"] >= 5 for r in rs),
                    count_total=sum(r["count"] for r in rs), simulated_total=sum(r["simulated"] for r in rs),
                    lanes=len([l for l in net.getEdge(rs[0]["edge"]).getLanes() if l.allows("passenger")]) if net.hasEdge(rs[0]["edge"]) else 0)
               for rs in worst]
os.makedirs(OUT, exist_ok=True)
json.dump(dict(overall=overall, per_hour=per_hour, worst_edges=worst_edges, rows=rows), open(os.path.join(OUT, "calibration.json"), "w"), indent=1)

print(f"{'hour':>4} {'edges':>5} {'GEH<5':>6} {'GEH<10':>6} {'meanGEH':>7} {'count':>7} {'simul':>7} {'dropped':>7} {'telep':>5} {'km/h':>5} {'v/lim':>5}")
for h, v in per_hour.items():
    print(f"{h:>4} {v['counted_edges']:>5} {v['geh_under_5']:>6.0%} {v['geh_under_10']:>6.0%} {v['mean_geh']:>7.2f} {v['count_total']:>7} {v['simulated_total']:>7} {v['dropped']:>7.1%} {v['teleports']:>5} {v['mean_speed_kmh']:>5.1f} {v['speed_relative']:>5.2f}")
print("overall:", json.dumps(overall))
print("worst edges (by total traffic missing or extra over the hours):")
for w in worst_edges:
    print(f"  {w['edge']:16} {w['street'][:22]:22} {w['site'][:24]:24} lanes {w['lanes']} count {w['count_total']:>6} simulated {w['simulated_total']:>6} fails {w['hours_failing']}/{len(args.hours)} h")
