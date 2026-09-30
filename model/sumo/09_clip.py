#!/usr/bin/env python3
"""Animated clip of the simulation around the closed block: normal street on the left, closure on the right.

    python3 04_run.py base --hour 17 --seed 6 --fcd 10
    python3 04_run.py closure --hour 17 --seed 6 --fcd 10
    python3 09_clip.py --hour 17 --seed 6 --minutes 10          # writes output/swanston-clip-17.gif

Reads the car positions (fcd.xml) the runs saved for the streets near the block. Cars are dots coloured by
speed (red stopped, green moving). Cars that drive through the block in the normal run, and so have to go
another way when it is closed, are drawn purple in both panels with a trail of where they have been, so the
change is visible even though those cars are a small share of the traffic. Three simulated seconds per frame,
10 frames a second, so a minute of traffic takes two seconds to watch.

The difference is easiest to see in the sensitivity case (right turn from La Trobe St allowed), which sends
about ten times as many cars through the block: run 04_run.py and this script with SUMO_WORK=work/allowed.
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
ap.add_argument("--minutes", type=float, default=5)
ap.add_argument("--radius", type=float, default=280, help="metres around the block to show")
ap.add_argument("--step", type=int, default=3, help="simulated seconds per frame")
ap.add_argument("--fps", type=int, default=10)
ap.add_argument("--subtitle", default="", help="extra words for the title, e.g. 'right turn from La Trobe St allowed'")
ap.add_argument("--trail", type=int, default=0, help="seconds of trail behind each diverted car (0: keep the whole clip, so the detours build up as purple lines)")
ap.add_argument("--copy-to", default=os.path.join(REPO, "public", "assets", "sumo-swanston-5pm.gif"), help="also copy the GIF here for the app ('' to skip)")
args = ap.parse_args()

net = load_net()
closed_ids, junction = find_closed_edges(net)
jx, jy = junction.getCoord()
cx, cy = net.getEdge(closed_ids[0]).getShape()[0]
cx, cy = (cx + jx) / 2, (cy + jy) / 2 + 40
t0 = (args.hour - SIM_START_H) * 3600
t1 = t0 + args.minutes * 60


def run_dir(scenario):
    return os.path.join(WORK, "runs", f"{scenario}_h{args.hour}_x{args.scale:g}_s{args.seed}")


def diverted_ids():
    """Cars whose route in the normal run uses the closed block: in the closure run they go another way."""
    ids = set()
    for _, el in ET.iterparse(os.path.join(run_dir("base"), "vehroute.xml")):
        if el.tag == "vehicle":
            r = el.find("route")
            if r is not None and set(r.get("edges", "").split()) & set(closed_ids):
                ids.add(el.get("id"))
            el.clear()
    return ids


def positions(scenario):
    frames = {}
    for _, el in ET.iterparse(os.path.join(run_dir(scenario), "fcd.xml")):
        if el.tag == "timestep":
            t = float(el.get("time"))
            if t0 <= t < t1 and int(t - t0) % args.step == 0:
                frames[t] = [(v.get("id"), float(v.get("x")), float(v.get("y")), float(v.get("speed"))) for v in el.iter("vehicle")]
            el.clear()
    return frames


diverted = diverted_ids()
base, clos = positions("base"), positions("closure")
times = sorted(set(base) & set(clos))
print(len(times), "frames;", len(diverted), "cars use the block in the normal run over the whole hour")
PURPLE = "#7b3294"

fig, axes = plt.subplots(1, 2, figsize=(9, 5.7))
lines = []
for e in net.getEdges():
    if not e.allows("passenger") and not e.allows("tram"):
        continue
    pts = e.getShape()
    if all(abs(x - cx) > args.radius or abs(y - cy) > args.radius for x, y in pts):
        continue
    lines.append((pts, e.allows("tram") and not e.allows("passenger")))
scat, trails, divs = [], [], []
for i, (ax, title) in enumerate(zip(axes, ("Normal street", "Swanston St block closed"))):
    ax.add_collection(LineCollection([l for l, tram in lines if not tram], colors="#d0d0d0", linewidths=2.5, zorder=1))
    ax.add_collection(LineCollection([l for l, tram in lines if tram], colors="#9fc6e8", linewidths=1.2, zorder=1.5))
    if i == 1:   # the block is only closed in the right-hand panel
        ax.add_collection(LineCollection([net.getEdge(c).getShape() for c in closed_ids], colors="black", linewidths=6, zorder=2))
    ax.set_xlim(cx - args.radius, cx + args.radius); ax.set_ylim(cy - args.radius, cy + args.radius)
    ax.set_aspect("equal"); ax.axis("off"); ax.set_title(title, fontsize=13)
    scat.append(ax.scatter([], [], s=9, c=[], cmap="RdYlGn", vmin=0, vmax=10, alpha=0.45, linewidths=0, zorder=3))
    trails.append(ax.scatter([], [], s=7, color=PURPLE, alpha=0.5, linewidths=0, zorder=3.5))
    divs.append(ax.scatter([], [], s=40, color=PURPLE, edgecolors="white", linewidths=0.7, zorder=4))
label = fig.text(0.5, 0.125, "", ha="center", fontsize=10)
title = f"SUMO simulation, weekday {args.hour % 12 or 12}{'am' if args.hour < 12 else 'pm'}, the streets around the closed block"
if args.subtitle:
    title += f" ({args.subtitle})"
fig.text(0.5, 0.965, title, ha="center", fontsize=11, color="#222")
from matplotlib.lines import Line2D
fig.legend(handles=[Line2D([], [], marker="o", color="none", markerfacecolor=PURPLE, markersize=9, label="Diverted car and its path"),
                    Line2D([], [], marker="o", color="none", markerfacecolor="#d73027", markersize=7, label="Stopped car"),
                    Line2D([], [], marker="o", color="none", markerfacecolor="#fdae61", markersize=7, label="Slow car"),
                    Line2D([], [], marker="o", color="none", markerfacecolor="#1a9850", markersize=7, label="Moving car"),
                    Line2D([], [], color="black", linewidth=5, label="Closed block"),
                    Line2D([], [], color="#9fc6e8", linewidth=2, label="Tram only"),
                    Line2D([], [], color="#d0d0d0", linewidth=3, label="Street")],
           loc="lower center", ncol=4, frameon=False, fontsize=9, bbox_to_anchor=(0.5, 0.005), handletextpad=0.4, columnspacing=1.2)
fig.text(0.99, 0.005, "Map data © OpenStreetMap contributors", ha="right", fontsize=7, color="#777")
fig.subplots_adjust(left=0.01, right=0.99, top=0.9, bottom=0.17, wspace=0.03)


seen = [set(), set()]   # diverted cars that have appeared so far, per panel


def draw(i):
    t = times[i]
    for k, (sc, tr, dv, run) in enumerate(zip(scat, trails, divs, (base, clos))):
        fr = run[t]
        plain = [(x, y, s) for vid, x, y, s in fr if vid not in diverted]
        purple = [(x, y) for vid, x, y, _ in fr if vid in diverted]
        seen[k].update(vid for vid, *_ in fr if vid in diverted)
        first = max(0, i - args.trail // args.step) if args.trail else 0
        past = [(x, y) for tt in times[first:i] for vid, x, y, _ in run[tt] if vid in diverted]
        sc.set_offsets([(x, y) for x, y, _ in plain] or [[0, 0]]); sc.set_array([s for _, _, s in plain] or [0])
        dv.set_offsets(purple or [[-1e6, -1e6]])
        tr.set_offsets(past or [[-1e6, -1e6]])
    m, s = divmod(int(t - t0), 60)
    label.set_text(f"{args.hour}:{m:02d}:{s:02d}   {len(base[t])} cars in view.   "
                   f"Purple cars so far: {len(seen[0])} through the block (left), {len(seen[1])} sent around it (right)")
    return scat + trails + divs + [label]


os.makedirs(OUT, exist_ok=True)
out = os.path.join(OUT, f"swanston-clip-{args.hour}.gif")
FuncAnimation(fig, draw, frames=len(times), blit=False).save(out, writer=PillowWriter(fps=args.fps), dpi=72)
print(out, os.path.getsize(out) // 1024, "KB")
if args.copy_to:
    import shutil
    shutil.copy(out, args.copy_to); print("copied to", args.copy_to)
