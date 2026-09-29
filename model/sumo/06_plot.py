#!/usr/bin/env python3
"""Slide image: the closed block and where the drivers who used it go instead.

    python3 06_plot.py --hour 8 --scale 0.5 --seeds 1 2 3 4 5 6

Only trips whose normal route used the closed block are drawn: their normal routes in blue,
their routes with the closure in red, averaged over the seeds and scaled to full traffic.
(Colouring every street by its change in traffic mostly shows run-to-run variation.)
Writes output/swanston-closure.png.
"""
import argparse, os, xml.etree.ElementTree as ET
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--hour", type=int, default=8)
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2, 3, 4, 5, 6])
ap.add_argument("--min-cars", type=float, default=2, help="hide streets used by fewer cars an hour than this")
ap.add_argument("--radius", type=float, default=750, help="metres around the site to show")
args = ap.parse_args()


t0 = (args.hour - SIM_START_H) * 3600
affected = {el.get("id") for el in ET.parse(os.path.join(WORK, "affected.trips.xml")).getroot().iter("trip")}


def route_use(scenario):
    """Cars an hour on each edge, over affected trips only, averaged over seeds, at full traffic."""
    use = {}
    for seed in args.seeds:
        d = os.path.join(WORK, "runs", f"{scenario}_h{args.hour}_x{args.scale:g}_s{seed}", "vehroute.xml")
        for _, v in ET.iterparse(d):
            if v.tag == "vehicle":
                if v.get("id") in affected and t0 <= float(v.get("depart")) < t0 + 3600:
                    r = v.find("route")
                    for e in (r.get("edges").split() if r is not None else []):
                        use[e] = use.get(e, 0) + 1 / len(args.seeds) / args.scale
                v.clear()
    return use


net = load_net()
closed, junction = find_closed_edges(net)
base, clos = route_use("base"), route_use("closure")

grey, gains, losses = [], [], []
for e in net.getEdges():
    shape = e.getShape()
    grey.append((shape, "#b9c4bc" if e.allows("passenger") else "#dde3de", 0.9 if e.allows("passenger") else 0.6))
    if e.getID() in closed:
        continue
    if clos.get(e.getID(), 0) >= args.min_cars:
        gains.append((shape, clos[e.getID()]))
    elif base.get(e.getID(), 0) >= args.min_cars:
        losses.append((shape, base[e.getID()]))

fig, ax = plt.subplots(figsize=(10, 8.4), dpi=120)
ax.add_collection(LineCollection([s for s, _, _ in grey], colors=[c for _, c, _ in grey], linewidths=[w for _, _, w in grey]))
top = max([abs(c) for _, c in gains + losses] or [1])
for group, colour in ((losses, "#2f6fad"), (gains, "#c4462b")):  # line width by cars an hour
    if group:
        ax.add_collection(LineCollection([s for s, _ in group], colors=colour,
                                         linewidths=[1.2 + 4.8 * abs(c) / top for _, c in group], capstyle="round"))
for cid in closed:
    xs, ys = zip(*net.getEdge(cid).getShape())
    ax.plot(xs, ys, color="#111", linewidth=7, solid_capstyle="butt", zorder=5)
jx, jy = junction.getCoord()
cx, cy = net.getEdge(closed[0]).getShape()[0] if closed else (jx, jy)
ax.annotate("Swanston St closed\nLa Trobe St to Little La Trobe St", (cx, cy), xytext=(cx + 200, cy - 330),
            fontsize=11, fontweight="bold", arrowprops=dict(arrowstyle="-", color="#111"), zorder=6)

ax.set_xlim(jx - args.radius, jx + args.radius); ax.set_ylim(jy - args.radius, jy + args.radius); ax.set_aspect("equal"); ax.axis("off")
hour = f"{args.hour % 12 or 12}{'am' if args.hour < 12 else 'pm'}"
ax.set_title(f"Paths taken by drivers who used the closed block, SUMO, weekday {hour} peak hour. Early result.\n"
             "Paths include live rerouting around jams. The shortest detour is about one block.",
             fontsize=12, loc="left")
ax.legend(handles=[Line2D([], [], color="#2f6fad", lw=4, label="Their normal routes"),
                   Line2D([], [], color="#c4462b", lw=4, label="Their routes with the closure"),
                   Line2D([], [], color="#111", lw=6, label="Closed block")],
          loc="lower left", frameon=True, fontsize=10)
ax.text(0.995, 0.005, "Map data © OpenStreetMap contributors", transform=ax.transAxes, ha="right", va="bottom", fontsize=8, color="#555")
os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, "swanston-closure.png")
fig.savefig(path, bbox_inches="tight", facecolor="white")
print(path, os.path.getsize(path) // 1024, "KB")
