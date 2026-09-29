"""Shared helpers for the Swanston closure simulation."""
import csv, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
# SUMO_WORK and SUMO_OUT point a variant (such as a network with a turn banned) at its own folders.
WORK = os.environ.get("SUMO_WORK", os.path.join(HERE, "work"))
OUT = os.environ.get("SUMO_OUT", os.path.join(HERE, "output"))
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
BBOX = (144.952, -37.816, 144.970, -37.801)  # lon_min, lat_min, lon_max, lat_max
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


def find_closed_edges(net):
    """Car edges of Swanston Street between La Trobe St and Little La Trobe St.

    Found by name and topology, not by hard-coded id: the car edge named Swanston Street that starts at the
    junction next to SCATS site 2921 (La Trobe) and whose end node meets Little La Trobe Street.
    """
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
