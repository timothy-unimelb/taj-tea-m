#!/usr/bin/env python3
"""Turn rules with a source, and a check that they are in the network.

    python3 07_turn_rules.py resolve [--allow RULE_ID ...]   # turn_rules.json -> work/turns.con.xml (needs work/net_raw.net.xml)
    python3 07_turn_rules.py access                         # cars off OSM ways tagged access/motor_vehicle = permit, no, private, delivery
    python3 07_turn_rules.py check                          # checks work/net.net.xml, writes work/turn_rules_report.json

02_build_net.sh runs both. Three sources of turn rules:
  1. OpenStreetMap turn restriction relations: netconvert applies them while importing. 'check' verifies each relation
     whose via node is inside the network: is the banned connection absent (no_*), or the only one left (only_*)?
  2. OpenStreetMap turn:lanes arrows (netconvert --osm.turn-lanes): which lane each turn is made from.
  3. turn_rules.json: what DTP signal sheets show and OpenStreetMap does not carry. 'ban' deletes a turn. 'hook_turn'
     moves a right turn to the kerb (leftmost) lane. --allow skips a rule (the sensitivity case).
'check' also lists every turn into and out of the closed block with its source.
"""
import argparse, json, math, os, re, sys, xml.etree.ElementTree as ET
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("mode", choices=["resolve", "access", "check"])
ap.add_argument("--allow", nargs="*", default=[], help="rule ids to skip")
args = ap.parse_args()

RULES = json.load(open(os.path.join(HERE, "turn_rules.json")))
RAW = os.path.join(WORK, "net_raw.net.xml")
CON = os.path.join(WORK, "turns.con.xml")
REPORT = os.path.join(WORK, "turn_rules_report.json")
site_pos = {s["site_no"]: (s["lat"], s["lon"]) for s in scats_sites()}
RULES["rules"] = [r for r in RULES["rules"] if in_bbox(*site_pos[r["site"]])]  # only the rules inside this study area


def osm_way(eid):
    return eid.lstrip("-").split("#")[0]


def approach_edges(net, junction, name, direction, incoming=True):
    eds = junction.getIncoming() if incoming else junction.getOutgoing()
    return [e for e in eds if e.allows("passenger") and e.getName() == name and direction_of(net, e, incoming) == direction]


def direction_of(net, e, incoming):
    if incoming:
        return direction(e)
    (x1, y1), (x2, y2) = e.getShape()[:2]
    b = math.degrees(math.atan2(x2 - x1, y2 - y1)) % 360
    return ["northbound", "eastbound", "southbound", "westbound"][int(((b + 45) % 360) // 90)]


def resolve(net, rule):
    """Connections a rule touches: list of (from_edge, to_edge, from_lane, to_lane) and problems."""
    lat, lon = site_pos[rule["site"]]
    j, dist = nearest_car_junction(net, lat, lon)
    out, problems = [], []
    if dist > 60:
        problems.append(f"nearest junction {j.getID()} is {dist:.0f} m from site {rule['site']}")
    if rule["kind"] == "ban":
        fr = approach_edges(net, j, rule["from"]["name"], rule["from"]["direction"], True)
        to = approach_edges(net, j, rule["to"]["name"], rule["to"]["direction"], False)
        if len(fr) != 1 or len(to) != 1:
            problems.append(f"from {[e.getID() for e in fr]} to {[e.getID() for e in to]}: need exactly one each")
        for f in fr:
            for t in to:
                for c in f.getConnections(t):
                    out.append((f.getID(), t.getID(), c.getFromLane().getIndex(), c.getToLane().getIndex()))
    else:
        for a in rule["approaches"]:
            fr = approach_edges(net, j, a["name"], a["direction"], True)
            if len(fr) != 1:
                problems.append(f"approach {a}: found {[e.getID() for e in fr]}")
            for f in fr:
                for t in f.getOutgoing():
                    for c in f.getConnections(t):
                        if c.getDirection() in ("r", "R"):
                            out.append((f.getID(), t.getID(), c.getFromLane().getIndex(), c.getToLane().getIndex()))
    return j.getID(), out, problems


def bearing(p, q):
    return math.degrees(math.atan2(q[0] - p[0], q[1] - p[1])) % 360


def angdiff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


_osm_cache = {}


def osm_data():
    if not _osm_cache:
        osm = ET.parse(OSM).getroot()
        _osm_cache["nodes"] = {n.get("id"): (float(n.get("lat")), float(n.get("lon"))) for n in osm.findall("node")}
        _osm_cache["ways"] = {w.get("id"): dict(tags={t.get("k"): t.get("v") for t in w.findall("tag")},
                                                nodes=[n.get("ref") for n in w.findall("nd")]) for w in osm.findall("way")}
        _osm_cache["relations"] = osm.findall("relation")
    return _osm_cache


def edge_for_way(net, cands, way, via, incoming):
    """The edge among cands (incoming to or outgoing from a junction) that carries OSM way `way` at node `via`.
    By id where netconvert kept it, else by street name, geometry and direction of travel."""
    byid = [e for e in cands if osm_way(e.getID()) == way]
    if byid:
        return byid[0], "id"
    d = osm_data()
    w = d["ways"].get(way)
    if not w:
        return None, "way not in extract"
    if via not in w["nodes"]:
        return None, "via not on way"
    i = w["nodes"].index(via)
    adjs = [w["nodes"][k] for k in (i - 1, i + 1) if 0 <= k < len(w["nodes"])]
    vx, vy = net.convertLonLat2XY(d["nodes"][via][1], d["nodes"][via][0])
    name = w["tags"].get("name")
    best = None
    for adj in adjs:
        ax, ay = net.convertLonLat2XY(d["nodes"][adj][1], d["nodes"][adj][0])
        want = bearing((ax, ay), (vx, vy)) if incoming else bearing((vx, vy), (ax, ay))
        for e in cands:
            if name and e.getName() != name:
                continue
            dist = min(math.hypot(px - ax, py - ay) for px, py in e.getShape())
            pts = e.getShape()[-2:] if incoming else e.getShape()[:2]
            have = bearing(pts[0], pts[1])
            if dist < 25 and angdiff(want, have) < 50 and (best is None or dist < best[1]):
                best = (e, dist)
    return (best[0], "name+geometry") if best else (None, "no matching edge")


def osm_restrictions(net):
    """Every OSM turn restriction relation: applied in this network, not applied, or why it could not be checked."""
    d = osm_data()
    xs = [p[0] for e in net.getEdges() for p in e.getShape()]
    ys = [p[1] for e in net.getEdges() for p in e.getShape()]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    rows = []
    for r in d["relations"]:
        tags = {t.get("k"): t.get("v") for t in r.findall("tag")}
        if tags.get("type") != "restriction":
            continue
        kind = tags.get("restriction") or tags.get("restriction:conditional", "")
        row = dict(relation=r.get("id"), restriction=kind, exempt=tags.get("except", ""))
        mem = [(m.get("role"), m.get("type"), m.get("ref")) for m in r.findall("member")]
        via = [m[2] for m in mem if m[0] == "via" and m[1] == "node"]
        via_way = [m[2] for m in mem if m[0] == "via" and m[1] == "way"]
        fr = [m[2] for m in mem if m[0] == "from"]
        to = [m[2] for m in mem if m[0] == "to"]
        row.update({"from": [d["ways"].get(f, {}).get("tags", {}).get("name", "?") + "/" + f for f in fr],
                    "to": [d["ways"].get(t, {}).get("tags", {}).get("name", "?") + "/" + t for t in to]})
        rows.append(row)
        if len(fr) != 1 or len(to) != 1 or not (via or via_way):
            row["status"] = "not checked (several from, to or via members)"
            continue
        if via_way:
            # a turn across a divided road: from -> via way -> to. With --junctions.join the via way is usually
            # inside one joined junction, so from and to meet there directly. Take the via way's end nodes as via.
            w = d["ways"].get(via_way[0])
            if not w or len(via_way) > 1:
                row["status"] = "not checked (via way not in extract, or several via ways)"
                continue
            row["via_way"] = via_way[0]
            via = [n for n in (w["nodes"][0], w["nodes"][-1]) if n in d["nodes"]]
            # 'from' touches one end, 'to' the other: choose the end each way contains
            via_f = [n for n in via if n in d["ways"].get(fr[0], {}).get("nodes", [])]
            via_t = [n for n in via if n in d["ways"].get(to[0], {}).get("nodes", [])]
            if not via_f or not via_t:
                row["status"] = "not checked (via way does not join the from and to ways in the extract)"
                continue
        else:
            via_f = via_t = via
        if via[0] not in d["nodes"]:
            row["status"] = "outside the extract"
            continue
        vx, vy = net.convertLonLat2XY(d["nodes"][via_f[0]][1], d["nodes"][via_f[0]][0])
        if not (bbox[0] <= vx <= bbox[2] and bbox[1] <= vy <= bbox[3]):
            row["status"] = "outside the network"
            continue
        if "restriction:conditional" in tags:
            row["status"] = "not applied (time-limited restriction; SUMO has no time-of-day turn bans)"
            continue
        # a joined junction's centre can be far from the via node: try every junction with an edge end within 30 m
        tx, ty = net.convertLonLat2XY(d["nodes"][via_t[0]][1], d["nodes"][via_t[0]][0])
        near = {n for e in net.getEdges() for n in (e.getFromNode(), e.getToNode())
                if any(math.hypot(px - x, py - y) < 30 for px, py in (e.getShape()[0], e.getShape()[-1]) for x, y in ((vx, vy), (tx, ty)))}
        found, how = None, ("?", "?")
        for jn in sorted(near, key=lambda n: math.hypot(n.getCoord()[0] - vx, n.getCoord()[1] - vy)):
            fe, how_f = edge_for_way(net, [e for e in jn.getIncoming() if e.allows("passenger")], fr[0], via_f[0], True)
            te, how_t = edge_for_way(net, [e for e in jn.getOutgoing() if e.allows("passenger")], to[0], via_t[0], False)
            how = (how_f, how_t)
            if fe and te:
                found = (jn, fe, te)
                break
        if not found:
            car_ways = {osm_way(e.getID()) for e in net.getEdges() if e.allows("passenger")}
            missing = [w for w in (fr[0], to[0]) if w not in car_ways]
            row["status"] = (f"no car edge for way {missing} (tram, bike or pedestrian only, or cut from the network): nothing to ban for cars"
                             if missing else f"unresolved (from: {how[0]}, to: {how[1]})")
            continue
        jn, fe, te = found
        if via_way and not fe.getConnections(te):
            ve = [e for e in fe.getOutgoing() if osm_way(e.getID()) == via_way[0] and fe.getConnections(e)]
            if ve and ve[0].getConnections(te):
                row.update(status="NOT APPLIED (via way kept as edge %s; not banned, other movements share it)" % ve[0].getID(),
                           junction=jn.getID()[:50], from_edge=fe.getID(), to_edge=te.getID(), via_edge=ve[0].getID())
                continue
        has = bool(fe.getConnections(te))
        others = [t.getID() for t in fe.getOutgoing() if t is not te and t.allows("passenger") and fe.getConnections(t)]
        ok = (not has) if kind.startswith("no_") else (has and not others)
        row.update(status="applied" if ok else "NOT APPLIED", junction=jn.getID()[:50], from_edge=fe.getID(), to_edge=te.getID(),
                   matched=f"{how[0]}/{how[1]}", other_turns=others if not kind.startswith("no_") else None)
    return rows


NO_CAR_TAGS = {"permit", "no", "private", "delivery", "customers"}
ACCESS_LOG = os.path.join(WORK, "no_car_access.json")

if args.mode == "access":
    # netconvert keeps cars on ways tagged access=permit (the permit-only blocks of Swanston St, where the signal
    # sheets show no general car traffic). Take passenger cars off every lane of those edges; trams, buses,
    # taxis, delivery and bikes stay.
    d = osm_data()
    nocar = {wid for wid, w in d["ways"].items()
             if w["tags"].get("highway") and (w["tags"].get("access") in NO_CAR_TAGS or w["tags"].get("motor_vehicle") in NO_CAR_TAGS
                                              or w["tags"].get("motorcar") in NO_CAR_TAGS)}
    txt = open(NET, encoding="utf8").read()
    patched = []

    def fix(m):
        blk = m.group(0)
        eid = re.search(r'<edge id="([^"]+)"', blk).group(1)
        if osm_way(eid) not in nocar:
            return blk
        patched.append(eid)
        blk = re.sub(r' (dis)?allow="[^"]*"', "", blk)
        return blk.replace("<lane ", '<lane allow="tram bus taxi delivery bicycle emergency" ')

    txt = re.sub(r'<edge id="[^"]*"[^>]*>.*?</edge>', fix, txt, flags=re.S)
    open(NET, "w", encoding="utf8").write(txt)
    names = sorted({(osm_way(e), d["ways"][osm_way(e)]["tags"].get("name", "?"), d["ways"][osm_way(e)]["tags"].get("access") or d["ways"][osm_way(e)]["tags"].get("motor_vehicle")) for e in patched})
    json.dump(dict(edges=patched, ways=names), open(ACCESS_LOG, "w"), indent=1)
    print(f"cars removed from {len(patched)} edges of {len(names)} OSM ways tagged permit/no/private/delivery:", names)
    sys.exit(0)

if args.mode == "resolve":
    net = sumolib.net.readNet(RAW)
    root = ET.Element("connections")
    root.append(ET.Comment(" generated by 07_turn_rules.py from turn_rules.json; do not edit "))
    applied = []
    for rule in RULES["rules"]:
        if rule["id"] in args.allow:
            print(f"{rule['id']}: skipped (--allow)")
            continue
        jid, conns, problems = resolve(net, rule)
        for p in problems:
            print(f"{rule['id']}: PROBLEM {p}")
        if rule["kind"] == "ban":
            seen = set()
            for f, t, fl, tl in conns:
                if (f, t) not in seen:
                    ET.SubElement(root, "delete", {"from": f, "to": t})
                    seen.add((f, t))
            print(f"{rule['id']}: ban {sorted(seen)} at {jid[:40]}")
        else:
            moved = []
            for f, t, fl, tl in conns:
                if fl == 0:
                    continue  # already from the kerb lane (OpenStreetMap turn:lanes)
                ET.SubElement(root, "delete", {"from": f, "to": t, "fromLane": str(fl), "toLane": str(tl)})
                ET.SubElement(root, "connection", {"from": f, "to": t, "fromLane": "0", "toLane": str(tl)})
                moved.append((f, t, fl))
            print(f"{rule['id']}: {len(conns)} right turns at {jid[:40]}, {len(moved)} moved to the kerb lane {moved}")
        applied.append(rule["id"])
    # OSM restriction relations that netconvert could not apply (its log says "direction of restriction relation
    # could not be determined" when a way is not split at the via node): apply them by geometry.
    fixed = []
    for row in osm_restrictions(net):
        if row["status"] != "NOT APPLIED":
            continue
        fe, te = net.getEdge(row["from_edge"]), net.getEdge(row["to_edge"])
        if row["restriction"].startswith("no_"):
            ET.SubElement(root, "delete", {"from": fe.getID(), "to": te.getID()})
        else:
            for t in row["other_turns"]:
                ET.SubElement(root, "delete", {"from": fe.getID(), "to": t})
        fixed.append(row["relation"])
    print(f"OpenStreetMap restrictions netconvert missed, now applied by geometry: {len(fixed)} {fixed}")
    ET.indent(root)
    ET.ElementTree(root).write(CON)
    json.dump(dict(applied_rules=applied, allowed=args.allow, osm_restrictions_applied_here=fixed), open(CON + ".json", "w"))
    sys.exit(0)

# ---- check ------------------------------------------------------------------------------------------------
net = load_net()
rule_state = json.load(open(CON + ".json")) if os.path.exists(CON + ".json") else dict(applied_rules=[], allowed=[])
report = dict(net=NET, rules=[], osm_restrictions=[], closed_block_turns=[],
              no_car_access=json.load(open(ACCESS_LOG)) if os.path.exists(ACCESS_LOG) else None)

# 1. rules from turn_rules.json
for rule in RULES["rules"]:
    if rule["id"] not in rule_state["applied_rules"]:
        report["rules"].append(dict(id=rule["id"], status="skipped", source=rule["source"]))
        continue
    jid, conns, problems = resolve(net, rule)
    if rule["kind"] == "ban":
        ok = not conns and not problems
    else:
        ok = bool(conns) and all(fl == 0 for _, _, fl, _ in conns) and not problems
    report["rules"].append(dict(id=rule["id"], status="applied" if ok else "NOT APPLIED", junction=jid, connections=conns,
                                problems=problems, source=rule["source"], confidence=rule.get("confidence")))

# 2. OpenStreetMap restriction relations
report["osm_restrictions"] = osm_restrictions(net)

# 3. every turn into and out of the closed block, with a source
closed_ids, junction = find_closed_edges(net)
banned_pairs = {}
for rule in RULES["rules"]:
    if rule["kind"] == "ban" and rule["id"] in rule_state["applied_rules"]:
        lat, lon = site_pos[rule["site"]]
        j, _ = nearest_car_junction(net, lat, lon)
        for f in approach_edges(net, j, rule["from"]["name"], rule["from"]["direction"], True):
            for t in approach_edges(net, j, rule["to"]["name"], rule["to"]["direction"], False):
                banned_pairs[(f.getID(), t.getID())] = rule
osm_pairs = {(r.get("from_edge"), r.get("to_edge")): r for r in report["osm_restrictions"] if r.get("from_edge") and r["status"] == "applied"}
for cid in closed_ids:
    ce = net.getEdge(cid)
    for node, incoming in ((ce.getFromNode(), True), (ce.getToNode(), False)):
        eds = node.getIncoming() if incoming else node.getOutgoing()
        for e in eds:
            if not e.allows("passenger") or e is ce:
                continue
            pair = (e.getID(), cid) if incoming else (cid, e.getID())
            conns = e.getConnections(ce) if incoming else ce.getConnections(e)
            if pair in banned_pairs:
                src = "banned: " + banned_pairs[pair]["source"]
            elif pair in osm_pairs:
                src = f"OpenStreetMap restriction relation {osm_pairs[pair]['relation']} ({osm_pairs[pair]['restriction']})"
            elif conns:
                src = "OpenStreetMap way connectivity, no restriction tagged, turn:lanes read"
            else:
                src = "no connection built by netconvert"
            report["closed_block_turns"].append(dict(
                turn=("into" if incoming else "out of") + " the block", other_edge=e.getID(), street=e.getName(),
                direction=direction(e) if incoming else direction_of(net, e, False),
                movement=(conns[0].getDirection() if conns else "-"),
                lanes=[(c.getFromLane().getIndex(), c.getToLane().getIndex()) for c in conns],
                allowed=bool(conns), source=src))

json.dump(report, open(REPORT, "w"), indent=1, default=str)
print("rules from turn_rules.json:")
for r in report["rules"]:
    print(f"  {r['status']:12} {r['id']}" + (f"  {r['connections']}" if r.get("connections") else "") + (f"  PROBLEMS {r['problems']}" if r.get("problems") else ""))
from collections import Counter
print("OpenStreetMap restriction relations:", dict(Counter(r["status"].split(" (")[0] for r in report["osm_restrictions"])))
for r in report["osm_restrictions"]:
    if r["status"].startswith("NOT") or r["status"].startswith("unresolved") or r["status"].startswith("no car"):
        print(f"  {r['status']}: {r['relation']} {r['restriction']} {r['from']} -> {r['to']}")
if report["no_car_access"]:
    print(f"cars kept off {len(report['no_car_access']['edges'])} edges tagged permit/no/private/delivery in OpenStreetMap:", sorted({w[1] for w in report['no_car_access']['ways']}))
print("turns into and out of the closed block", closed_ids, ":")
for t in report["closed_block_turns"]:
    print(f"  {t['turn']:17} {t['street']:22} {t['direction']:10} {'allowed' if t['allowed'] else 'BANNED ':8} {t['movement']:2} lanes {t['lanes']}  <- {t['source'][:90]}")
