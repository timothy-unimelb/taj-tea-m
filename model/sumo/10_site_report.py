#!/usr/bin/env python3
"""Compare the normal and closure runs of a site (SUMO_SITE) and write its report numbers.

    SUMO_SITE=smac python3 10_site_report.py --seeds 1 2 3 4 5

For sites other than the CBD sample (that one uses 05_to_impact_json.py). Reads work/<site>/runs/ and writes
  output/<site>/impact.json   ImpactResult for the app (lib/impact/types.ts, model/IMPACT_CONTRACT.md), with the plan gaps
                              below as its findings and, if public/assets/sumo-<site>-detour.png exists, that picture
  output/<site>/facts.json    everything measured, as plain numbers with units, for the report writer (Claude) to
                              turn into the report's traffic, pedestrian, public transport and safety points
  output/<site>/runs.json     the raw numbers per run
The works hours come from sites/<site>.json. Each hour is its own run (04_run.py --hour 9.5 is 9:30am to 10:30am).

Two closure cases are compared with the normal street (03_demand.py):
  signed    drivers reach the closure and go round from there, as the detour signs ask. The main case.
  closure   drivers know beforehand and pick their own way from the start of the trip.

What is measured, and how:
  diverted drivers   cars entering the closed block in the normal runs, against the detector count of that lane
  where they go      the same drivers' routes with and without the closure, per street and direction
  delay              travel time of the same trips with and without the closure; two normal runs with different
                     seeds give the noise floor, and an effect inside it is reported as noise
  street loads       cars an hour at the busiest point of each street the diverted drivers use, against a
                     planning capacity per lane
  queues             longest jam on the approach to the closure and on each leg of the signed detour
  calibration        simulated traffic against the counts (GEH), cars dropped, speed
  plan gaps          not from the runs: streets the closure turns into dead ends (from the network), and bus routes
                     whose OpenStreetMap route uses the closed lane or the signed detour
"""
import argparse, datetime, json, math, os, re, statistics, xml.etree.ElementTree as ET
from collections import defaultdict
from common import *

if not SITE:
    raise SystemExit("Set SUMO_SITE. The CBD sample uses 05_to_impact_json.py.")
W = SITE["works"]
ap = argparse.ArgumentParser()
ap.add_argument("--hours", type=float, nargs="+", default=[W["start_hour"] + i for i in range(int(W["end_hour"] - W["start_hour"]))])
ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2, 3, 4, 5])
ap.add_argument("--lane-capacity", type=float, default=700.0,
                help="cars an hour one lane carries through a signalised junction (planning value: 1,800 an hour of green, about 40 percent green)")
args = ap.parse_args()
hours, seeds = sorted(args.hours), args.seeds
CASES = {"signed": "drivers go round from the closure, following the signs", "closure": "drivers know beforehand and pick their own way"}

net = load_net()
closed_ids, _ = find_closed_edges(net)
closed = set(closed_ids)
demand = json.load(open(os.path.join(WORK, "demand_summary.json")))
C = SITE["closure"]


def clock(h):
    m = round(h * 60)
    return f"{(m // 60) % 12 or 12}{':%02d' % (m % 60) if m % 60 else ''}{'am' if m < 720 else 'pm'}"


def window(h):
    t0 = round((h - SIM_START_H) * 3600)
    return t0, t0 + 3600


def run_dir(scenario, seed, h):
    return os.path.join(WORK, "runs", f"{scenario}_h{h:g}_x1_s{seed}")


def cars(e):
    return len([l for l in e.getLanes() if l.allows("passenger")])


def street(e):
    """(street name, direction of travel from the edge's start to its end). Links inside junctions have no name."""
    (x1, y1), (x2, y2) = e.getShape()[0], e.getShape()[-1]
    b = math.degrees(math.atan2(x2 - x1, y2 - y1)) % 360
    return (e.getName() or "unnamed link", ["northbound", "eastbound", "southbound", "westbound"][int(((b + 45) % 360) // 90)])


def label(key):
    return f"{key[0]} {key[1]}"


STREET = {e.getID(): street(e) for e in net.getEdges()}


def named(node, skip):
    return [x.getName() for x in node.getIncoming() + node.getOutgoing() if x.allows("passenger") and x.getName() not in ("", skip)]


def through_links(node, skip):
    """The other street at a junction, looking through unnamed links (a roundabout's ring has no name)."""
    seen, frontier = {node}, [node]
    for _ in range(4):
        found = [n for f in frontier for n in named(f, skip)]
        if found:
            return max(set(found), key=found.count)
        frontier = [m for f in frontier for x in f.getIncoming() + f.getOutgoing() if x.allows("passenger") and not x.getName()
                    for m in (x.getFromNode(), x.getToNode()) if m not in seen and not seen.add(m)]
    return "the edge of the study area"


def section(e):
    """(street, direction, cross street behind, cross street ahead): the block of a street an edge belongs to."""
    name, way = STREET[e.getID()]

    def end(edge, back):
        for _ in range(15):
            node = edge.getFromNode() if back else edge.getToNode()
            found = named(node, name)
            if found:
                return max(set(found), key=found.count)
            onward = [x for x in (node.getIncoming() if back else node.getOutgoing()) if x.allows("passenger") and STREET[x.getID()] == (name, way)]
            if not onward:
                return through_links(node, name)
            edge = onward[0]
        return "the edge of the study area"
    return (name, way, end(e, True), end(e, False))


SECTION = {e.getID(): section(e) for e in net.getEdges() if e.allows("passenger") and e.getName()}
SECTION = {k: v for k, v in SECTION.items() if v[2] != v[3]}   # a link inside one junction is not a block


def block(key):
    return f"{key[0]} {key[1]}, {key[2]} to {key[3]}"


# ---- reading one run ---------------------------------------------------------------------------------------
def trips(d, h):
    """Trips departing in the hour: id -> (duration s, route length m)."""
    t0, t1 = window(h)
    out = {}
    for _, el in ET.iterparse(os.path.join(d, "tripinfo.xml")):
        if el.tag == "tripinfo":
            if t0 <= float(el.get("depart")) < t1:
                out[el.get("id")] = (float(el.get("duration")), float(el.get("routeLength")))
            el.clear()
    return out


def routes(d, h, only=None):
    """Last route driven by trips departing in the hour: id -> edge list."""
    t0, t1 = window(h)
    out = {}
    for _, el in ET.iterparse(os.path.join(d, "vehroute.xml")):
        if el.tag == "vehicle":
            r = el.find("route")
            if r is not None and t0 <= float(el.get("depart")) < t1 and (only is None or el.get("id") in only):
                out[el.get("id")] = r.get("edges").split()
            el.clear()
    return out


def edgedata(d):
    """Per edge in the hour: cars that used it, and seconds to drive it."""
    out = {}
    for e in ET.parse(os.path.join(d, "edgedata.xml")).getroot().iter("edge"):
        out[e.get("id")] = (float(e.get("entered", 0)) + float(e.get("departed", 0)), float(e.get("traveltime", 0) or 0))
    return out


def jams(d, h):
    """Per edge, per 5 minutes of the hour: longest jam over its lanes, metres."""
    t0, t1 = window(h)
    out = defaultdict(lambda: defaultdict(float))
    for _, el in ET.iterparse(os.path.join(d, "queues.xml")):
        if el.tag == "interval":
            b = float(el.get("begin"))
            if t0 <= b < t1:
                eid = el.get("id")[2:].rsplit("_", 1)[0]
                out[eid][b] = max(out[eid][b], float(el.get("maxJamLengthInMeters")))
            el.clear()
    return out


def health(d, h):
    t0, t1 = window(h)
    steps = re.findall(r'<step time="([\d.]+)"[^>]*loaded="(\d+)"[^>]*teleports="(\d+)"[^>]*meanSpeed="([\d.]+)" meanSpeedRelative="([\d.]+)" discarded="(\d+)"',
                       open(os.path.join(d, "summary.xml")).read())
    inh = [s for s in steps if t0 <= float(s[0]) < t1]
    return dict(dropped=int(steps[-1][5]) / int(steps[-1][1]), teleports=int(steps[-1][2]),
                speed_kmh=statistics.mean(float(s[3]) for s in inh) * 3.6, speed_relative=statistics.mean(float(s[4]) for s in inh))


def spread(vals, unit, digits=0):
    vals = sorted(vals)
    r = (lambda x: round(x)) if digits == 0 else (lambda x: round(x, digits))
    return {"low": r(vals[0]), "typical": r(statistics.median(vals)), "high": r(vals[-1]), "unit": unit}


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else 0.0


# ---- streets of the signed detour and the approach to the closure ------------------------------------------
def crossing(a, b):
    """Where street a meets street b (x, y): the closest pair of their junctions (a roundabout's ring has no name)."""
    na = {n for e in net.getEdges() if e.getName() == a for n in (e.getFromNode(), e.getToNode())}
    nb = {n for e in net.getEdges() if e.getName() == b for n in (e.getFromNode(), e.getToNode())}
    best = min(math.dist(p.getCoord()[:2], q.getCoord()[:2]) for p in na for q in nb)
    near = [(p, q) for p in na for q in nb if math.dist(p.getCoord()[:2], q.getCoord()[:2]) <= best + 1]
    xs = [c for p, q in near for c in (p.getCoord()[0], q.getCoord()[0])]
    ys = [c for p, q in near for c in (p.getCoord()[1], q.getCoord()[1])]
    return sum(xs) / len(xs), sum(ys) / len(ys)


legs = [dict(role="approach to the closure", **SITE["approach"])] + [dict(role="signed detour", **l) for l in SITE["detour"]]
for leg in legs:
    a, b = (net.convertXY2LonLat(*crossing(leg["street"], x)) for x in leg["between"])
    eds = edges_along(net, leg["street"], leg["direction"], (a[1], a[0]), (b[1], b[0]), 30.0)
    leg.update(edges=[e.getID() for e in eds], name=f"{leg['street']} {leg['direction']}, {leg['between'][0]} to {leg['between'][1]}",
               length_m=round(sum(e.getLength() for e in eds)), lanes=min(cars(e) for e in eds))


def leg_queue(j, leg):
    """Longest jam on the leg in the hour: per 5 minutes, the jams of its edges added up."""
    times = {t for e in leg["edges"] for t in j.get(e, {})}
    return max((sum(j.get(e, {}).get(t, 0.0) for e in leg["edges"]) for t in times), default=0.0)


# ---- the normal runs, read once ----------------------------------------------------------------------------
BASE = {}
for h in hours:
    for seed in seeds:
        d = run_dir("base", seed, h)
        rb = routes(d, h)
        BASE[(h, seed)] = dict(trips=trips(d, h), routes=rb, users={v for v, r in rb.items() if closed & set(r)},
                               ed=edgedata(d), jams=jams(d, h), health=health(d, h))

targets = {}
for iv in ET.parse(os.path.join(WORK, "counts.xml")).getroot().iter("interval"):
    targets[int(float(iv.get("begin")) // 3600) + SIM_START_H] = {e.get("id"): float(e.get("entered")) for e in iv.iter("edge")}


def target(h, eid):
    lo = int(math.floor(h))
    f = h - lo
    return (1 - f) * targets[lo].get(eid, 0.0) + f * targets.get(lo + 1, targets[lo]).get(eid, 0.0)


# diverted drivers, calibration and health come from the normal runs alone
hourly, calib_rows = [], []
for h in hours:
    ent = [max(BASE[(h, s)]["ed"].get(e, (0, 0))[0] for e in closed_ids) for s in seeds]
    hs = [BASE[(h, s)]["health"] for s in seeds]
    hourly.append(dict(hour=f"{clock(h)} to {clock(h + 1)}", simulated_median=statistics.median(ent), simulated_range=[min(ent), max(ent)],
                       counted=round(target(h, closed_ids[-1])), mean_speed_kmh=round(statistics.mean(x["speed_kmh"] for x in hs), 1),
                       dropped_share=round(max(x["dropped"] for x in hs), 3)))
    for eid in targets[int(h)]:
        m = statistics.mean(BASE[(h, s)]["ed"].get(eid, (0, 0))[0] for s in seeds)
        cnt = target(h, eid)
        calib_rows.append(dict(hour=h, edge=eid, street=label(STREET[eid]), count=round(cnt), simulated=round(m),
                               geh=round(math.sqrt(2 * (m - cnt) ** 2 / (m + cnt)) if m + cnt else 0.0, 1)))
diverted = spread([sum(max(BASE[(h, s)]["ed"].get(e, (0, 0))[0] for e in closed_ids) for h in hours) for s in seeds], "vehicles")
counted = round(sum(target(h, closed_ids[-1]) for h in hours))
gehs = [r["geh"] for r in calib_rows]
calib = dict(counted_street_hours=len(gehs), geh_under_5=round(sum(g < 5 for g in gehs) / len(gehs), 3), geh_under_10=round(sum(g < 10 for g in gehs) / len(gehs), 3),
             mean_geh=round(statistics.mean(gehs), 2), mean_speed_kmh=round(statistics.mean(x["mean_speed_kmh"] for x in hourly), 1),
             max_dropped_share=round(max(x["dropped_share"] for x in hourly), 3), max_teleports=max(b["health"]["teleports"] for b in BASE.values()),
             worst=sorted(calib_rows, key=lambda r: -r["geh"])[:6])

# noise floors: the same trips in two normal runs with different seeds
floor_all, floor_users = [], []
for s1, s2 in zip(seeds, seeds[1:]):
    ta = tu = 0.0
    for h in hours:
        a, b, users = BASE[(h, s1)]["trips"], BASE[(h, s2)]["trips"], BASE[(h, s1)]["users"]
        ta += sum(b[v][0] - a[v][0] for v in a.keys() & b.keys()) / 3600
        tu += sum(b[v][0] - a[v][0] for v in users if v in a and v in b) / 3600
    floor_all.append(round(ta, 1)); floor_users.append(round(tu, 1))
floor = max(abs(x) for x in floor_all)
floor_u = max(abs(x) for x in floor_users)
net_closed = sumolib.net.readNet(os.path.join(WORK, "net_closed.net.xml"))


# ---- one closure case against the normal runs --------------------------------------------------------------
def measure(case):
    rows, extra_s, extra_m, od = [], [], [], set()
    extra_by_seed = defaultdict(list)
    street_users = {"base": defaultdict(float), case: defaultdict(float)}
    edge_users = {"base": defaultdict(float), case: defaultdict(float)}
    flow = {"base": defaultdict(list), case: defaultdict(list)}
    stats = {l["name"]: defaultdict(list) for l in legs}
    worst_lane = []
    for h in hours:
        for seed in seeds:
            B = BASE[(h, seed)]
            c = run_dir(case, seed, h)
            tb, tc, rb, users = B["trips"], trips(c, h), B["routes"], B["users"]
            rc = routes(c, h, users)
            both = tb.keys() & tc.keys()
            for v in users:
                if v in tb and v in tc:
                    extra_s.append(tc[v][0] - tb[v][0]); extra_m.append(tc[v][1] - tb[v][1]); od.add((rb[v][0], rb[v][-1]))
                    extra_by_seed[seed].append(tc[v][0] - tb[v][0])
                for name, rr in (("base", rb), (case, rc)):
                    if v in rr:
                        for key in {SECTION[e] for e in rr[v] if e in SECTION}:
                            street_users[name][key] += 1
                        for e in set(rr[v]):
                            edge_users[name][e] += 1
            ec, jc = edgedata(c), jams(c, h)
            for name, ed in (("base", B["ed"]), (case, ec)):
                for e, (n, _) in ed.items():
                    flow[name][e].append(n)
            for leg in legs:
                s = stats[leg["name"]]
                s["queue_base"].append(leg_queue(B["jams"], leg)); s["queue_case"].append(leg_queue(jc, leg))
                s["time_base"].append(sum(B["ed"].get(e, (0, 0))[1] for e in leg["edges"])); s["time_case"].append(sum(ec.get(e, (0, 0))[1] for e in leg["edges"]))
            worst_lane.append(max((max(jc[e].values()) - max(B["jams"].get(e, {0: 0.0}).values()) for e in jc), default=0.0))
            hc = health(c, h)
            rows.append(dict(case=case, hour=h, seed=seed, trips=len(tb), matched=len(both), block_users=len(users),
                             delay_all_veh_h=round(sum(tc[v][0] - tb[v][0] for v in both) / 3600, 2),
                             delay_users_veh_h=round(sum(tc[v][0] - tb[v][0] for v in users if v in both) / 3600, 2),
                             dropped=round(hc["dropped"], 4), teleports=hc["teleports"]))
        for leg in legs:   # noise floor for queues: the same leg in two normal runs with different seeds
            q = [leg_queue(BASE[(h, s)]["jams"], leg) for s in seeds]
            stats[leg["name"]]["queue_noise"] += [abs(a - b) for a, b in zip(q, q[1:])]

    def total(key, seed):
        return sum(r[key] for r in rows if r["seed"] == seed)

    delay_all = spread([total("delay_all_veh_h", s) for s in seeds], "vehicle-hours", 1)
    delay_users = spread([total("delay_users_veh_h", s) for s in seeds], "vehicle-hours", 1)
    per_trip = dict(median=round(statistics.median(extra_s)), lower_quartile=round(pct(extra_s, 0.25)), upper_quartile=round(pct(extra_s, 0.75)),
                    mean=round(statistics.mean(extra_s)), mean_across_seeds=spread([statistics.mean(v) for v in extra_by_seed.values()], "seconds"),
                    trips_compared=len(extra_s))
    short = []
    for f, t in od:
        a = net.getShortestPath(net.getEdge(f), net.getEdge(t), vClass="passenger")
        c = net_closed.getShortestPath(net_closed.getEdge(f), net_closed.getEdge(t), vClass="passenger")
        if a[0] and c[0]:
            short.append(c[1] - a[1])
    detour = {"low": max(0, round(pct(extra_m, 0.25))), "typical": max(0, round(pct(extra_m, 0.5))), "high": max(0, round(pct(extra_m, 0.75))), "unit": "m"}

    # where the diverted drivers go: streets that gain them, at the busiest point of each
    def fullness(e):
        return max(flow[case].get(e.getID(), [0])) / (cars(e) * args.lane_capacity)

    gain = {k: (street_users[case].get(k, 0) - street_users["base"].get(k, 0)) / len(seeds)
            for k in set(street_users["base"]) | set(street_users[case])}
    streets = []
    for key, g in sorted(gain.items(), key=lambda kv: -kv[1]):
        if g < 0.05 * diverted["typical"] or len(streets) >= 8:
            continue
        eds = [net.getEdge(e) for e, sec in SECTION.items() if sec == key]
        busiest = max(eds, key=fullness)   # the point where a lane is fullest, not where most cars pass
        fb, fc = statistics.mean(flow["base"].get(busiest.getID(), [0])), statistics.mean(flow[case].get(busiest.getID(), [0]))
        peak = max(flow[case].get(busiest.getID(), [0]))
        ratio = peak / (cars(busiest) * args.lane_capacity)
        streets.append(dict(street=block(key), diverted_drivers_over_the_works=round(g), lanes_at_busiest_point=cars(busiest),
                            cars_an_hour_normal=round(fb), cars_an_hour_with_closure=round(fc), cars_in_busiest_hour_with_closure=round(peak),
                            share_of_capacity_in_busiest_hour=round(ratio, 2),
                            verdict="well within capacity" if ratio < 0.6 else "busy" if ratio < 0.85 else "near or over capacity"))
    relieved = [dict(street=block(k), fewer_drivers_over_the_works=round(-g)) for k, g in sorted(gain.items(), key=lambda kv: kv[1])[:8]
                if -g >= 0.05 * diverted["typical"] and not (k[0] == C["street"] and k[1] == C["direction"] and {k[2], k[3]} == {C["from_cross"], C["to_cross"]})][:5]

    leg_out = []
    for leg in legs:
        s = stats[leg["name"]]
        growth = statistics.median(s["queue_case"]) - statistics.median(s["queue_base"])
        noise = statistics.median(s["queue_noise"]) if s["queue_noise"] else 0.0
        tight = max((net.getEdge(e) for e in leg["edges"]), key=fullness)
        leg_out.append(dict(
            leg=leg["name"], role=leg["role"], length_m=leg["length_m"], lanes_at_fullest_point=cars(tight),
            cars_an_hour=dict(normal=round(statistics.mean(flow["base"].get(tight.getID(), [0]))), with_closure=round(statistics.mean(flow[case].get(tight.getID(), [0]))),
                              busiest_hour_with_closure=round(max(flow[case].get(tight.getID(), [0])))),
            share_of_capacity_in_busiest_hour=round(fullness(tight), 2),
            cars_an_hour_by_hour_and_seed=spread(flow[case].get(tight.getID(), [0]), "cars an hour"),
            longest_queue_m=dict(normal_typical=round(statistics.median(s["queue_base"])), normal_worst=round(max(s["queue_base"])),
                                 with_closure_typical=round(statistics.median(s["queue_case"])), with_closure_worst=round(max(s["queue_case"])),
                                 typical_difference_between_two_normal_runs=round(noise), grows_more_than_noise=bool(growth > noise and growth >= 5)),
            seconds_to_drive=dict(normal=round(statistics.mean(s["time_base"])), with_closure=round(statistics.mean(s["time_case"])))))
    growing = [l for l in leg_out if l["longest_queue_m"]["grows_more_than_noise"]]
    max_queue = None
    if growing:
        wl = max(growing, key=lambda l: l["longest_queue_m"]["with_closure_typical"])
        q = stats[wl["leg"]]["queue_case"]
        max_queue = dict(leg=wl["leg"], range={"low": round(pct(q, 0.25)), "typical": round(statistics.median(q)), "high": round(max(q)), "unit": "m"})
    return dict(
        case=CASES[case], rows=rows, delay_all=delay_all, delay_users=delay_users, per_trip=per_trip, detour=detour, max_queue=max_queue,
        delay_all_is_noise=bool(delay_all["low"] <= 0 or abs(delay_all["typical"]) <= floor),
        delay_users_is_noise=bool(delay_users["low"] <= 0 or abs(delay_users["typical"]) <= floor_u),
        facts=dict(
            case=CASES[case],
            delay=dict(extra_seconds_per_diverted_trip=per_trip, diverted_trips_total_vehicle_hours=delay_users,
                       diverted_trips_noise_floor_vehicle_hours=floor_u, all_traffic_vehicle_hours=delay_all, all_traffic_noise_floor_vehicle_hours=floor,
                       all_traffic_change_is_within_noise=bool(delay_all["low"] <= 0 or abs(delay_all["typical"]) <= floor)),
            extra_distance_per_diverted_trip_m=dict(lower_quartile=detour["low"], median=detour["typical"], upper_quartile=detour["high"],
                                                    shortest_way_round_median=max(0, round(statistics.median(short))) if short else 0),
            streets_taking_the_diverted_drivers=streets, streets_relieved=relieved, approach_and_signed_detour=leg_out,
            worst_single_lane_queue_growth_m=round(max(worst_lane)),
            health=dict(max_dropped_share=max(r["dropped"] for r in rows), max_teleports=max(r["teleports"] for r in rows))))


results = {case: measure(case) for case in CASES if os.path.isdir(run_dir(case, seeds[0], hours[0]))}
main = results.get("signed") or results["closure"]
other = results.get("closure") if main is results.get("signed") else None

# ---- streets the closure cuts off --------------------------------------------------------------------------
hub = connected_edge(net, closed)
out_now, out_before = reach(hub, False, closed), reach(hub, False)
in_now, in_before = reach(hub, True, closed), reach(hub, True)


def normal_flow(e):
    return round(statistics.mean(BASE[k]["ed"].get(e.getID(), (0, 0))[0] for k in BASE))


cut_off = [dict(street=label(STREET[e.getID()]), length_m=round(e.getLength()), cars_an_hour_normal=normal_flow(e), problem=why)
           for group, why in (([e for e in out_before if e not in out_now], "cars on it can only leave through the closed block"),
                              ([e for e in in_before if e not in in_now], "cars can only reach it through the closed block"))
           for e in group if e.getID() not in closed and e.getLength() > 15]

# ---- plan gaps found from the street network and route data, not from the runs ----------------------------
def short(name):
    return name.replace(" Street", " St")


findings = []
for e in [e for e in out_before if e not in out_now and e.getID() not in closed and e.getLength() > 15 and e.getID() in SECTION]:
    name, way, behind, ahead = SECTION[e.getID()]
    counted_here = e.getID() in targets[int(hours[0])]
    over_works = sum(target(h, e.getID()) for h in hours) if counted_here else normal_flow(e) * len(hours)
    findings.append(dict(
        mode="cars",
        title=f"Close {short(name)} {way} at {short(behind)}",
        summary=f"{name} {way} can only turn into the closed lane at {ahead}, so it becomes a dead end while the works are on. "
                f"About {round(over_works / len(hours), -1):.0f} cars an hour arrive there.",
        impact=f"Drivers reach the closure with no way out and have to turn around in {short(name)}.",
        why=f"About {round(over_works, -1):.0f} cars use this approach over the works hours ({'SCATS detector count' if counted_here else 'simulated'}). "
            f"The signed detour starts on {C['street']}, so nothing turns these drivers away.",
        recommendation=f"Put a road closed ahead sign on {short(name)} at {short(behind)}, local access only, so drivers turn off before the block.",
        source="Street network from OpenStreetMap and SCATS detector counts"))

# bus routes whose OpenStreetMap route uses the closed lane, or a street of the signed detour
way_of = lambda eid: eid.lstrip("-").split("#")[0]
closed_ways = {way_of(e) for e in closed_ids}
leg_ways = {way_of(e): l["street"] for l in legs if l["role"] == "signed detour" for e in l["edges"]}
through, along = {}, defaultdict(set)
for _, el in ET.iterparse(OSM):
    if el.tag == "relation":
        tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
        if tags.get("type") == "route" and tags.get("route") == "bus" and tags.get("ref"):
            ways = {m.get("ref") for m in el.findall("member") if m.get("type") == "way"}
            if ways & closed_ways:
                through[tags["ref"]] = (tags.get("name") or "").split(":")[-1].strip().replace("=>", "to").replace(" railway station", "")
            for w in ways & set(leg_ways):
                along[leg_ways[w]].add(tags["ref"])
        el.clear()
    elif el.tag in ("node", "way"):
        el.clear()
for ref, name in sorted(through.items()):
    findings.append(dict(
        mode="public_transport",
        title=f"Agree a detour for bus {ref}",
        summary=f"Bus {ref} ({name}) drives the closed lane of {C['street']}. It needs its own detour while the works are on.",
        impact="Buses reach the closure and take the car detour unplanned, run late, or miss stops.",
        why="A diverted service needs the operator's agreement, and passengers need to know where it stops.",
        recommendation="Tell the operator and the Department of Transport and Planning before the works start. Agree the detour and any temporary stop, and sign it. "
                       "The route comes from OpenStreetMap, so confirm it against the current timetable first.",
        source="Bus routes from OpenStreetMap"))
bus_text = ""
if through:
    bus_text += f" Bus {' and '.join(sorted(through))} uses the closed lane."
for st, refs in sorted(along.items()):
    refs = sorted(refs - set(through))
    leg = next(l for l in main["facts"]["approach_and_signed_detour"] if l["leg"].startswith(st))
    if refs:
        t0, t1 = leg["seconds_to_drive"]["normal"], leg["seconds_to_drive"]["with_closure"]
        bus_text += (f" Buses {', '.join(refs[:-1])} and {refs[-1]} use" if len(refs) > 1 else f" Bus {refs[0]} uses") + f" {st} on the signed detour, where " + \
                    ("the drive time for a car does not change." if abs(t1 - t0) <= 2 else f"a car takes {t1} seconds to drive the block against {t0} normally.")

# ---- the app's ImpactResult --------------------------------------------------------------------------------
span = f"{clock(hours[0])} to {clock(hours[-1] + 1)}"
period = f"{W['days']} {span}"
via = ", ".join(l["street"] for l in SITE["detour"][:-1]) + " and " + SITE["detour"][-1]["street"]
mf = main["facts"]
detour_legs = [l for l in mf["approach_and_signed_detour"] if l["role"] == "signed detour"]
fullest = max(detour_legs, key=lambda l: l["share_of_capacity_in_busiest_hour"])
pt = main["per_trip"]
street_lines = [{"label": f"{l['leg'].split(',')[0]} (normally {l['cars_an_hour']['normal']} cars an hour, reaches {l['share_of_capacity_in_busiest_hour']:.0%} of a lane's capacity)",
                 "range": l["cars_an_hour_by_hour_and_seed"]} for l in detour_legs]
cars_mode = {
    "status": "modelled",
    **({} if main["delay_all_is_noise"] else {"delay": {k: (round(v) if k != "unit" else v) for k, v in main["delay_all"].items()}}),
    **({"max_queue": main["max_queue"]["range"]} if main["max_queue"] else {}),
    "forced_diversions": diverted, "detour": main["detour"],
    "other": ([] if main["delay_users_is_noise"] else [{"label": "Extra time per diverted trip", "range": pt["mean_across_seeds"]}]) + street_lines,
    "summary": f"About {round(diverted['typical'], -1):,} {C['direction']} drivers over the works hours must leave {C['street']} at {C['from_cross']}. "
               f"On the signed detour the fullest street, {fullest['leg'].split(',')[0]}, reaches {fullest['share_of_capacity_in_busiest_hour']:.0%} of a lane's capacity"
               + ("." if main["delay_users_is_noise"] else f", and a diverted trip takes about {pt['mean']} seconds longer."),
}
q_note = (f"Queue: the longest jam in an hour on {main['max_queue']['leg']}, the longest of the queues on the approach and signed detour that grow by more than two normal runs differ."
          if main["max_queue"] else "Queues on the approach and the signed detour did not grow by more than two normal runs differ from each other, so no queue is reported.")
result = {
    "model": "sumo",
    "method": "SUMO traffic simulation",
    "label": "Early result",
    "provenance": "precomputed",
    "confidence": "medium" if calib["geh_under_5"] >= 0.85 and calib["max_dropped_share"] < 0.02 else "low",
    "confidence_note": f"A detector counts the closed lane itself, so the number of diverted drivers is measured, not inferred. Where they go and the delay come from simulated routes and simulated signal timings (the real phases at Faraday St, SUMO's own elsewhere), "
                       f"which reproduce the counts on {calib['geh_under_5']:.0%} of counted street-hours.",
    "period": period,
    "recommended_window": None,
    "modes": {
        "cars": cars_mode,
        "public_transport": {"status": "not modelled", "summary": "Tram and bus services were not simulated." + bus_text},
        "pedestrians": {"status": "not modelled", "summary": "Pedestrians were not simulated."},
        "trucks": {"status": "not modelled", "summary": "All vehicles are simulated as cars. Trucks are not modelled on their own."},
    },
    "assumptions": [
        f"Every hour of the works ({span} on a weekday) simulated separately after a 30 minute warm-up, {len(seeds)} random seeds each, and added up.",
        f"Closure: the car lane of {C['street']} {C['direction']} between {C['from_cross']} and {C['to_cross']} ({sum(net.getEdge(e).getLength() for e in closed_ids):.0f} m). "
        "The other direction, bikes and footpaths stay open. The plan's note banning a right turn from Grattan St into Swanston St northbound is not modelled.",
        f"Diverted drivers: cars entering the closed lane in the normal runs, {diverted['low']:,} to {diverted['high']:,} over the works hours. "
        f"SCATS detector 5 of site 4392 counts that lane at the Melbourne University tram stop: {counted:,} cars over the same hours (August 2026 weekday medians).",
        f"Main case: drivers drive their normal route to the closure, go round by the signed detour ({via}) and rejoin their route after the block. "
        + (f"If instead every driver knows beforehand and picks their own way, most leave {C['street']} a block early and the load moves to {' and '.join(dict.fromkeys(s['street'].split(',')[0] for s in other['facts']['streets_taking_the_diverted_drivers']))}." if other else ""),
        f"Traffic fitted to car counts per approach from SCATS stop-line detectors at {len(demand['measured_sites'])} junctions around the site (detector roles from DTP signal sheets, some from 2008 and 2014), "
        f"and to whole-site totals at {len(demand['counting_sites']) - len(demand['measured_sites'])} others, using SUMO routeSampler.",
        f"Calibration: in the normal runs the simulated traffic matches the counts within GEH 5 on {calib['geh_under_5']:.0%} of counted street-hours. Mean speed {calib['mean_speed_kmh']:.0f} km/h. "
        f"At most {calib['max_dropped_share']:.1%} of cars could not enter within 5 minutes and were dropped.",
        "Street network from OpenStreetMap (© OpenStreetMap contributors), car streets only, left-hand traffic, turn restrictions and lane arrows from OpenStreetMap. " + ("Swanston St / Faraday St runs the phases and walk times of its 2024 DTP signal sheet (site 4392): drivers turning left into Faraday St wait for the 15 s pedestrian walk, and the tram stop crossings get their own phase every cycle. Every other junction uses SUMO's delay-based actuated control, not the real SCATS plans. SCATS sets the real cycle length minute by minute and does not publish it."
        if SITE.get("signal_plans") else "Signals are SUMO's delay-based actuated control, not the real SCATS plans."),
        f"Delay is the extra travel time of the same trips with and without the closure. For all traffic, two normal runs differ by up to {floor:,.0f} vehicle-hours over the works hours on their own"
        + (f", and the closure runs differ from normal by {main['delay_all']['low']:,.0f} to {main['delay_all']['high']:,.0f}, so no area-wide delay is reported." if main["delay_all_is_noise"] else ", so a smaller effect would be reported as noise.")
        + f" For the diverted trips alone the floor is {floor_u:,.1f} vehicle-hours.",
        f"Street capacity is a planning value: {args.lane_capacity:.0f} cars an hour per lane through signals.",
        q_note,
        "Cars only. No trams, buses, trucks, cyclists or pedestrians were simulated.",
    ],
    "findings": findings,
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
picture = os.path.join(REPO, "public", "assets", f"sumo-{SITE_ID}-detour.png")   # 06_plot.py --case signed, copied there
clip = SITE.get("clip")   # 09_clip.py --copy-to public/assets/..., shown in place of the route map
if clip and os.path.exists(os.path.join(REPO, "public", clip["src"].lstrip("/"))):
    import struct
    width, height = struct.unpack("<HH", open(os.path.join(REPO, "public", clip["src"].lstrip("/")), "rb").read(10)[6:10])
    result["visual"] = {
        "src": clip["src"], "width": width, "height": height,
        "alt": clip.get("alt") or f"Animation of {clip['minutes']} simulated minutes around the closed lane. Left, the normal street: purple dots are drivers using the lane, and a queue forms at the Faraday Street lights. Right, the lane closed: the same drivers go round by {via}.",
        "caption": clip.get("caption") or f"{clip['minutes']} simulated minutes from {clock(clip['hour'])} on a weekday. Left: the normal street. Right: the lane closed, drivers following the signs. Purple dots are the drivers who normally use the closed lane.",
        "legend": [],   # the clip has its own legend
    }
elif os.path.exists(picture):
    import struct
    width, height = struct.unpack(">II", open(picture, "rb").read(24)[16:24])
    result["visual"] = {
        "src": f"/assets/sumo-{SITE_ID}-detour.png", "width": width, "height": height,
        "alt": f"Map of the streets around the closed lane. Blue lines show the normal routes of drivers who use the lane. Red lines show the same drivers going round by {via}.",
        "caption": f"One simulated weekday hour from {clock(hours[0])}. The drivers who normally use the closed lane, and the way they go round it when they follow the signs. Thicker lines carry more cars.",
        "legend": [{"label": "Normal routes", "colour": "#2f6fad"}, {"label": "Routes with the closure", "colour": "#c4462b"}, {"label": "Closed lane", "colour": "#111111"}],
    }

facts = dict(
    about="Numbers from the SUMO simulation of this closure, for the report writer. Every value is measured from the runs or the counts. Nothing here is a judgement. Ranges are across random seeds.",
    site=dict(name=SITE["name"], area=SITE["area"], closure=f"{C['street']} {C['direction']} closed between {C['from_cross']} and {C['to_cross']}",
              closed_length_m=round(sum(net.getEdge(e).getLength() for e in closed_ids)), works=period,
              signed_detour=[f"{l['street']} {l['direction']}" for l in SITE["detour"]],
              study_area_km="%.1f by %.1f around the site" % ((BBOX[2] - BBOX[0]) * 88.0, (BBOX[3] - BBOX[1]) * 111.0)),
    diverted_drivers=dict(simulated_over_the_works=diverted, counted_on_the_closed_lane=counted,
                          count_source="SCATS site 4392 detector 5, weekday medians, August 2026", by_hour=hourly),
    streets_cut_off_by_the_closure=cut_off,
    bus_routes=dict(through_the_closed_lane=sorted(through), on_the_signed_detour={k: sorted(v) for k, v in along.items()}, source="OpenStreetMap route relations"),
    plan_gaps=findings,
    if_drivers_follow_the_signs=results["signed"]["facts"] if "signed" in results else None,
    if_drivers_know_beforehand=results["closure"]["facts"] if "closure" in results else None,
    calibration_of_the_normal_runs=calib,
    lane_capacity_assumed_cars_an_hour=args.lane_capacity,
    not_simulated=["trams", "buses", "trucks", "cyclists", "pedestrians", "the plan's right-turn ban at Grattan St"],
)
os.makedirs(OUT, exist_ok=True)
json.dump(result, open(os.path.join(OUT, "impact.json"), "w"), indent=2, ensure_ascii=False)
json.dump(facts, open(os.path.join(OUT, "facts.json"), "w"), indent=2, ensure_ascii=False)
json.dump(dict(hours=hours, seeds=seeds, per_run=[r for v in results.values() for r in v["rows"]], delay_noise_pairs_all_traffic=floor_all,
               delay_noise_pairs_diverted_trips=floor_users, calibration_rows=calib_rows), open(os.path.join(OUT, "runs.json"), "w"), indent=1)
print(json.dumps(facts, indent=1))
print("cars:", json.dumps(cars_mode, indent=1))
