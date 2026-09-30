"""Shared helpers for the Swanston closure simulation."""
import csv, json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
# SUMO_SITE picks another site: its area, closure and works hours come from sites/<name>.json, and everything
# is built in work/<name>/ and output/<name>/. Without it the scripts run the CBD sample (Swanston St closed
# between La Trobe St and Little La Trobe St), as before.
SITE_ID = os.environ.get("SUMO_SITE", "")
SITE = json.load(open(os.path.join(HERE, "sites", SITE_ID + ".json"))) if SITE_ID else None
# SUMO_WORK and SUMO_OUT point a variant (such as a network with a turn banned) at its own folders.
WORK = os.environ.get("SUMO_WORK", os.path.join(HERE, "work", SITE_ID) if SITE_ID else os.path.join(HERE, "work"))
OUT = os.environ.get("SUMO_OUT", os.path.join(HERE, "output", SITE_ID) if SITE_ID else os.path.join(HERE, "output"))
OSM = os.path.join(HERE, SITE["osm"]) if SITE else os.path.join(HERE, "work", "swanston.osm")
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SCATS_DAILY = os.path.join(REPO, "model/headline_stats/output/02_scats_site_daily.csv")
SCATS_HOURLY = os.path.join(REPO, "model/headline_stats/output/01_scats_hourly_profile.csv")
NET = os.path.join(WORK, "net.net.xml")
sys.path.insert(0, os.path.join(os.environ.get("SUMO_HOME", ""), "tools"))
import sumolib  # noqa: E402

# Study area (lon/lat) used to pick SCATS counting sites. Sites nearer the edge are ignored.
# The OSM download covers 144.952 to 144.974. The network is cut at 144.970 (just east of
# Exhibition St): the Spring St / Nicholson St / Victoria Pde junctions at the old east edge
# gridlocked even at 30% demand and the jam spread across the CBD.
BBOX = tuple(SITE["bbox"]) if SITE else (144.952, -37.816, 144.970, -37.801)  # lon_min, lat_min, lon_max, lat_max
SITE_2921 = (2921, "SWANSTON/LATROBE", -37.80959, 144.96383)

SIM_START_H = 6   # 6am is warm-up, results use departures from 7am
SIM_END_H = 22    # last departures at 10pm
REPORT_START_H = 7


def load_net():
    return sumolib.net.readNet(NET)


def hourly_share():
    sh = {}
    for r in csv.DictReader(open(SCATS_HOURLY)):
        if r["day_type"] == "Weekday":
            sh[int(r["hour_local"])] = float(r["share_of_day"])
    return sh


def scats_sites():
    out = []
    for r in csv.DictReader(open(SCATS_DAILY)):
        if r["day_type"] != "Weekday":
            continue
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
        except ValueError:
            continue
        out.append(dict(site_no=int(r["site_no"]), name=r["site_name"], type=r["site_type"],
                        lat=lat, lon=lon, daily=float(r["avg_daily_vehicles"])))
    return out


def reach(start, fwd=True, banned=()):
    seen = {start}
    st = [start]
    while st:
        e = st.pop()
        for n in (e.getOutgoing() if fwd else e.getIncoming()):
            if n.getID() in banned or not n.allows("passenger") or n in seen:
                continue
            seen.add(n)
            st.append(n)
    return seen


def in_bbox(lat, lon):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def edges_along(net, street, way, a, b, max_offset=25.0):
    """Car edges of a street, in one direction of travel, whose middle lies beside the line from a to b (lat, lon)."""
    (x1, y1), (x2, y2) = (net.convertLonLat2XY(p[1], p[0]) for p in (a, b))
    length = math.hypot(x2 - x1, y2 - y1)
    out = []
    for e in net.getEdges():
        if not e.allows("passenger") or e.getName() != street or direction(e) != way:
            continue
        mx, my = sumolib.geomhelper.positionAtShapeOffset(e.getShape(), e.getLength() / 2)
        t = ((mx - x1) * (x2 - x1) + (my - y1) * (y2 - y1)) / length ** 2
        off = abs((mx - x1) * (y2 - y1) - (my - y1) * (x2 - x1)) / length
        if 0 <= t <= 1 and off <= max_offset:
            out.append((t, e))
    return [e for _, e in sorted(out, key=lambda te: te[0])]


def connected_edge(net, closed=()):
    """A well connected car edge: the start for working out which edges the closure cuts off."""
    if not SITE:
        return net.getEdge("279989319")  # La Trobe St
    cands = sorted((e for e in net.getEdges() if e.allows("passenger") and e.getID() not in closed), key=lambda e: -e.getLength())[:12]
    return max(cands, key=lambda e: len(reach(e) & reach(e, False)))


def find_closed_edges(net):
    """The closed car edges and a junction at the closure (the centre for queue detectors and the viewer).

    With SUMO_SITE: the edges of the site file's closure (street, direction of travel, between two points).
    Without: car edges of Swanston Street between La Trobe St and Little La Trobe St.

    Found by name and topology, not by hard-coded id: the car edge named Swanston Street that starts at the
    junction next to SCATS site 2921 (La Trobe) and whose end node meets Little La Trobe Street.
    """
    if SITE:
        c = SITE["closure"]
        eds = edges_along(net, c["street"], c["direction"], c["from"], c["to"])
        return [e.getID() for e in eds], eds[len(eds) // 2].getFromNode()
    x, y = net.convertLonLat2XY(SITE_2921[3], SITE_2921[2])
    cands = [n for n in net.getNodes() if any(e.allows("passenger") for e in n.getIncoming() + n.getOutgoing())]
    j = min(cands, key=lambda n: (n.getCoord()[0] - x) ** 2 + (n.getCoord()[1] - y) ** 2)
    closed = []
    for e in net.getEdges():
        if not e.allows("passenger") or e.getName() != "Swanston Street":
            continue
        a, b = e.getFromNode(), e.getToNode()
        # both directions between the La Trobe junction and the Little La Trobe node
        for u, v in ((a, b), (b, a)):
            if u == j and any(o.getName() == "Little La Trobe Street" for o in v.getOutgoing() + v.getIncoming()):
                closed.append(e.getID())
                break
    return closed, j


def direction(e):
    """Compass direction of travel at the end of an edge (the CBD grid is about 20 degrees off north)."""
    (x1, y1), (x2, y2) = e.getShape()[-2:]
    b = math.degrees(math.atan2(x2 - x1, y2 - y1)) % 360
    return ["northbound", "eastbound", "southbound", "westbound"][int(((b + 45) % 360) // 90)]


def nearest_car_junction(net, lat, lon):
    """The junction with car traffic nearest a SCATS site, and its distance in metres."""
    x, y = net.convertLonLat2XY(lon, lat)
    cands = [n for n in net.getNodes() if any(e.allows("passenger") for e in n.getIncoming())]
    j = min(cands, key=lambda n: (n.getCoord()[0] - x) ** 2 + (n.getCoord()[1] - y) ** 2)
    return j, math.hypot(j.getCoord()[0] - x, j.getCoord()[1] - y)
