#!/usr/bin/env python3
"""Animated clip of the simulation around the closed block: normal street on the left, closure on the right.

    python3 04_run.py base --hour 17 --seed 6 --fcd 10
    python3 04_run.py closure --hour 17 --seed 6 --fcd 10
    python3 09_clip.py --hour 17 --seed 6 --minutes 10          # writes output/swanston-clip-17.gif

Reads the car positions (fcd.xml) the runs saved for the streets near the block. Cars are dots coloured by
speed (red stopped, green moving). Two simulated seconds per frame, 12 frames a second, so a minute of
traffic takes about 2.5 seconds to watch.
"""
import argparse, os, xml.etree.ElementTree as ET
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.collections import LineCollection
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--hour", type=int, default=17)
ap.add_argument("--seed", type=int, default=6)
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--minutes", type=float, default=10)
ap.add_argument("--radius", type=float, default=280, help="metres around the block to show")
ap.add_argument("--step", type=int, default=2, help="simulated seconds per frame")
ap.add_argument("--fps", type=int, default=12)
args = ap.parse_args()

net = load_net()
closed_ids, junction = find_closed_edges(net)
jx, jy = junction.getCoord()
cx, cy = net.getEdge(closed_ids[0]).getShape()[0]
cx, cy = (cx + jx) / 2, (cy + jy) / 2 + 40
t0 = (args.hour - SIM_START_H) * 3600
t1 = t0 + args.minutes * 60


def positions(scenario):
    d = os.path.join(WORK, "runs", f"{scenario}_h{args.hour}_x{args.scale:g}_s{args.seed}")
    frames = {}
    for _, el in ET.iterparse(os.path.join(d, "fcd.xml")):
        if el.tag == "timestep":
            t = float(el.get("time"))
            if t0 <= t < t1 and int(t - t0) % args.step == 0:
                frames[t] = [(float(v.get("x")), float(v.get("y")), float(v.get("speed"))) for v in el.iter("vehicle")]
            el.clear()
    return frames


base, clos = positions("base"), positions("closure")
times = sorted(set(base) & set(clos))
print(len(times), "frames")

fig, axes = plt.subplots(1, 2, figsize=(12, 6.4))
lines = []
for e in net.getEdges():
    if not e.allows("passenger") and not e.allows("tram"):
        continue
    pts = e.getShape()
    if all(abs(x - cx) > args.radius or abs(y - cy) > args.radius for x, y in pts):
        continue
    lines.append(pts)
scat = []
for ax, title in zip(axes, ("Normal street", "Swanston St block closed")):
    ax.add_collection(LineCollection(lines, colors="#d0d0d0", linewidths=2.5, zorder=1))
    ax.add_collection(LineCollection([net.getEdge(c).getShape() for c in closed_ids], colors="black", linewidths=6, zorder=2))
    ax.set_xlim(cx - args.radius, cx + args.radius); ax.set_ylim(cy - args.radius, cy + args.radius)
    ax.set_aspect("equal"); ax.axis("off"); ax.set_title(title, fontsize=13)
    scat.append(ax.scatter([], [], s=14, c=[], cmap="RdYlGn", vmin=0, vmax=10, zorder=3))
label = fig.text(0.5, 0.03, "", ha="center", fontsize=11)
fig.text(0.5, 0.965, f"SUMO, weekday {args.hour % 12 or 12}{'am' if args.hour < 12 else 'pm'}, cars around the closed block. Red: stopped, green: moving. Map data © OpenStreetMap contributors",
         ha="center", fontsize=10, color="#444")


def draw(i):
    t = times[i]
    for sc, fr in zip(scat, (base[t], clos[t])):
        if fr:
            sc.set_offsets([(x, y) for x, y, _ in fr]); sc.set_array([s for _, _, s in fr])
        else:
            sc.set_offsets([[0, 0]]); sc.set_array([0])
    m, s = divmod(int(t - t0), 60)
    label.set_text(f"{args.hour}:{m:02d}:{s:02d}   normal run: {len(base[t])} cars in view, closure run: {len(clos[t])}")
    return scat + [label]


os.makedirs(OUT, exist_ok=True)
out = os.path.join(OUT, f"swanston-clip-{args.hour}.gif")
FuncAnimation(fig, draw, frames=len(times), blit=False).save(out, writer=PillowWriter(fps=args.fps), dpi=72)
print(out, os.path.getsize(out) // 1024, "KB")
