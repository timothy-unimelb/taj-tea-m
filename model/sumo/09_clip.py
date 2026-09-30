#!/usr/bin/env python3
"""Animated clip of the simulation around the closed block: normal street on the left, closure on the right.

    python3 04_run.py base --hour 17 --seed 6 --fcd 10
    python3 04_run.py closure --hour 17 --seed 6 --fcd 10
    python3 09_clip.py --hour 17 --seed 6 --minutes 10          # writes output/swanston-clip-17.gif

Reads the car positions (fcd.xml) the runs saved for the streets near the block. Other traffic is grey dots.
Cars that drive through the block in the normal run, and so have to go another way when it is closed, are
drawn purple in both panels with a trail of where they have been, so the change is visible even though those
cars are a small share of the traffic. The legend has three items only: those drivers, other traffic and the
closed block. Three simulated seconds per frame,
10 frames a second, so a minute of traffic takes two seconds to watch.

The difference is easiest to see in the sensitivity case (right turn from La Trobe St allowed), which sends
about ten times as many cars through the block: run 04_run.py and this script with SUMO_WORK=work/allowed.

Another site (SUMO_SITE=smac) compares with its main case, the signed detour:
    SUMO_SITE=smac python3 04_run.py base --hour 11.5 --seed 1 --fcd 10
    SUMO_SITE=smac python3 04_run.py signed --hour 11.5 --seed 1 --fcd 10
    SUMO_SITE=smac python3 09_clip.py --scenario signed --hour 11.5 --seed 1 --minutes 6 --centre=-37.7994,144.9649 --radius 175

--queues also colours each block of street (one direction, from one cross street to the next) by how fast its
cars are moving, in both panels, and writes a second file (clip-<hour>-queues.gif). The measure is the average
speed of the cars on the block over the last two minutes, as a share of the speed limit. Two minutes is longer
than a signal cycle, so one red light does not turn a street red. Green is over half the limit, yellow 30% to
50%, orange 15% to 30%, red under 15%. A block with fewer than 10 car-seconds in the two minutes is green. The
colours are one run. The fcd.xml files must come from the current 04_run.py, which also saves each car's lane.

--scale 10 draws runs made with 04_run.py --scale 10 (ten times the measured traffic, a what-if). The title
says so and the file name gets -x10.
"""
import argparse, math, os, sys, xml.etree.ElementTree as ET
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.collections import LineCollection
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--hour", type=float, default=17, help="clock hour, e.g. 17 or 11.5 for 11:30am")
ap.add_argument("--scenario", default="closure", choices=["closure", "signed"], help="the run to compare with the normal street")
ap.add_argument("--seed", type=int, default=6)
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--minutes", type=float, default=5)
ap.add_argument("--start", type=float, default=0, help="minutes into the hour at which the clip starts")
ap.add_argument("--radius", type=float, default=280, help="metres around the block to show")
ap.add_argument("--centre", default="", help="lat,lon to centre the view on (default: next to the closed block)")
ap.add_argument("--step", type=int, default=3, help="simulated seconds per frame")
ap.add_argument("--fps", type=int, default=10)
ap.add_argument("--subtitle", default="", help="extra words for the title, e.g. 'right turn from La Trobe St allowed'")
ap.add_argument("--trail", type=int, default=75, help="seconds of trail behind each highlighted car (0: keep the whole clip)")
ap.add_argument("--queues", action="store_true", help="colour each block by how many more cars are queued on it than on the normal street")
ap.add_argument("--copy-to", default="" if SITE else os.path.join(REPO, "public", "assets", "sumo-swanston-5pm.gif"), help="also copy the GIF here for the app ('' to skip)")
args = ap.parse_args()

net = load_net()
closed_ids, junction = find_closed_edges(net)
jx, jy = junction.getCoord()
cx, cy = net.getEdge(closed_ids[0]).getShape()[0]
cx, cy = (cx + jx) / 2, (cy + jy) / 2 + 40
if args.centre:
    lat, lon = map(float, args.centre.split(","))
    cx, cy = net.convertLonLat2XY(lon, lat)
t0 = (args.hour - SIM_START_H) * 3600
c0 = t0 + args.start * 60   # the clip runs from c0 to t1
t1 = c0 + args.minutes * 60


def run_dir(scenario):
    return os.path.join(WORK, "runs", f"{scenario}_h{args.hour:g}_x{args.scale:g}_s{args.seed}")


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


# --queues: seconds looked back over, the share of the speed limit under which a block turns yellow, orange and red,
# and the fewest car-seconds in the window for a block to be coloured.
WINDOW, BANDS, MIN_SECONDS = 120, (0.5, 0.3, 0.15), 10
QUEUE = (("#2fae57", 5, "Flowing"), ("#ffd21f", 7, "Slow"), ("#ff8a00", 8, "Very slow"), ("#e0201b", 9, "Queued"))   # colour, line width, legend


def way(e):
    """Direction of travel as a quarter of the compass, 0 to 3."""
    (x1, y1), (x2, y2) = e.getShape()[0], e.getShape()[-1]
    return int(((math.degrees(math.atan2(x2 - x1, y2 - y1)) + 45) % 360) // 90)


def blocks():
    """Car edges grouped into blocks: one street in one direction, from one cross street to the next."""
    edges = [e for e in net.getEdges() if e.allows("passenger")]
    head = {e.getID(): e.getID() for e in edges}

    def first(i):
        while head[i] != i:
            i = head[i]
        return i
    for e in edges:
        node = e.getToNode()
        if not e.getName() or any(x.getName() not in ("", e.getName()) for x in node.getIncoming() + node.getOutgoing() if x.allows("passenger")):
            continue   # another street meets here, so the block ends
        for f in node.getOutgoing():
            if f.getID() in head and f.getName() == e.getName() and way(f) == way(e):
                head[first(f.getID())] = first(e.getID())
    out = {}
    for e in edges:
        out.setdefault(first(e.getID()), []).append(e)
    return [b for b in out.values() if b[0].getName() and sum(e.getLength() for e in b) >= 25]   # shorter or unnamed: a link inside a junction


block_of = {e.getID(): i for i, b in enumerate(blocks()) for e in b} if args.queues else {}   # edge id -> its block
limit = {e.getID(): e.getSpeed() for e in net.getEdges()}


def positions(scenario):
    """Car positions for each frame, and for --queues each block's car-seconds and summed speed (as a share of the limit) in every second of the clip and the WINDOW before it."""
    frames, first = {}, None
    n = int(t1 - c0) + WINDOW
    seconds, speed = np.zeros((max(block_of.values(), default=0) + 1, n)), np.zeros((max(block_of.values(), default=0) + 1, n))
    for _, el in ET.iterparse(os.path.join(run_dir(scenario), "fcd.xml")):
        if el.tag == "timestep":
            t = float(el.get("time"))
            first = t if first is None else first
            if c0 <= t < t1 and int(t - c0) % args.step == 0:
                frames[t] = [(v.get("id"), float(v.get("x")), float(v.get("y")), float(v.get("speed"))) for v in el.iter("vehicle")]
            if args.queues and c0 - WINDOW <= t < t1:
                for v in el.iter("vehicle"):
                    if v.get("lane") is None:
                        sys.exit("fcd.xml has no lanes. Run 04_run.py --fcd again for both scenarios.")
                    edge = v.get("lane").rsplit("_", 1)[0]
                    i = block_of.get(edge)
                    if i is not None:
                        seconds[i, int(t - c0) + WINDOW] += 1
                        speed[i, int(t - c0) + WINDOW] += float(v.get("speed")) / limit[edge]
            el.clear()
    if args.queues and first > c0 - WINDOW:
        sys.exit("fcd.xml starts too late for the two-minute average. Run 04_run.py --fcd again for both scenarios.")
    return frames, (np.cumsum(seconds, axis=1), np.cumsum(speed, axis=1))


def levels(sums, t):
    """Each block's place in QUEUE at time t: the average speed of its cars over the last WINDOW seconds, as a share of the limit."""
    i = int(t - c0) + WINDOW - 1
    seconds, speed = (a[:, i] - a[:, i - WINDOW] for a in sums)
    share = np.where(seconds >= MIN_SECONDS, speed / np.maximum(seconds, 1), 1.0)
    return sum(share < b for b in BANDS)


diverted = diverted_ids()
(base, base_q), (clos, clos_q) = positions("base"), positions(args.scenario)
times = sorted(set(base) & set(clos))
print(len(times), "frames;", len(diverted), "cars use the block in the normal run over the whole hour")
PURPLE, GREY = "#7b3294", "#333333" if args.queues else "#9a9a9a"   # drivers who normally use the block (both panels); other traffic
COL = (PURPLE, PURPLE)

fig, axes = plt.subplots(1, 2, figsize=(9, 5.7))
lines = []
for e in net.getEdges():
    if not e.allows("passenger") and not e.allows("tram"):
        continue
    pts = e.getShape()
    if all(abs(x - cx) > args.radius or abs(y - cy) > args.radius for x, y in pts):
        continue
    lines.append((pts, e.allows("tram") and not e.allows("passenger"), block_of.get(e.getID())))
# Names of the closed street and the detour streets, placed on their longest edge in view.
from matplotlib import patheffects
street_labels = {}
if SITE:
    import math
    names = {SITE["closure"]["street"]} | {d["street"] for d in SITE.get("detour", [])}
    best = {}
    for e in net.getEdges():
        pts = e.getShape()
        mx, my = pts[len(pts) // 2]
        if e.getName() in names and abs(mx - cx) < args.radius * 0.8 and abs(my - cy) < args.radius * 0.8 and e.getLength() > best.get(e.getName(), (0,))[0]:
            (x0, y0), (x1, y1) = pts[0], pts[-1]
            angle = math.degrees(math.atan2(y1 - y0, x1 - x0))
            angle = angle - 180 if angle > 90 else angle + 180 if angle < -90 else angle
            best[e.getName()] = (e.getLength(), ((x0 + x1) / 2, (y0 + y1) / 2, angle))
    street_labels = {n.replace("Street", "St"): v for n, (_, v) in best.items()}
scat, trails, divs, streets = [], [], [], []
in_block = [(l, i) for l, _, i in lines if i is not None]   # the lines to colour, each with its block
closed_name = f"{SITE['closure']['street']} {SITE['closure']['direction']} closed" if SITE else "Swanston St block closed"
for i, (ax, title) in enumerate(zip(axes, ("Normal street", closed_name))):
    ax.add_collection(LineCollection([l for l, tram, block in lines if not tram and block is None], colors="#d0d0d0" if args.queues else "#e4e4e4", linewidths=2.5, zorder=1))
    ax.add_collection(LineCollection([l for l, tram, _ in lines if tram], colors="#9fc6e8", linewidths=1.2, zorder=1.5))
    streets.append(ax.add_collection(LineCollection([l for l, _ in in_block], colors=QUEUE[0][0], linewidths=QUEUE[0][1], capstyle="butt", zorder=1.2)))
    if i == 1:   # the block is only closed in the right-hand panel
        ax.add_collection(LineCollection([net.getEdge(c).getShape() for c in closed_ids], colors="black", linewidths=6, zorder=2))
    ax.set_xlim(cx - args.radius, cx + args.radius); ax.set_ylim(cy - args.radius, cy + args.radius)
    for name, (x, y, angle) in street_labels.items():
        if args.queues:   # beside the street, so the name does not cover its colour
            x, y = x - math.sin(math.radians(angle)) * args.radius * 0.07, y + math.cos(math.radians(angle)) * args.radius * 0.07
        ax.text(x, y, name, rotation=angle, ha="center", va="center", fontsize=8, color="#555", zorder=5,
                path_effects=[patheffects.withStroke(linewidth=3, foreground="white")])
    ax.set_aspect("equal"); ax.axis("off"); ax.set_title(title, fontsize=13)
    scat.append(ax.scatter([], [], s=12, color=GREY, linewidths=0, zorder=3))
    trails.append(ax.scatter([], [], s=4, color=COL[i], alpha=0.35, linewidths=0, zorder=3.5))
    divs.append(ax.scatter([], [], s=40, color=COL[i], edgecolors="white", linewidths=0.7, zorder=4))
label = fig.text(0.5, 0.215 if args.queues else 0.11, "", ha="center", fontsize=11)

def clock(seconds_after_start, seconds=False):
    h, rem = divmod(int(args.hour * 3600 + seconds_after_start), 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if seconds else f"{h % 12 or 12}{f':{m:02d}' if m else ''}{'am' if h < 12 else 'pm'}"


title = f"SUMO simulation, weekday {clock(args.start * 60)}, the streets around the closed block"
what_if = f"{args.scale:g} times the measured traffic" if args.scale != 1 else ""
if args.subtitle or what_if:
    title += f" ({', '.join(w for w in (args.subtitle, what_if) if w)})"
fig.text(0.5, 0.965, title, ha="center", fontsize=11 if len(title) < 85 else 9.5, color="#222")
from matplotlib.lines import Line2D
fig.legend(handles=[Line2D([], [], marker="o", color="none", markerfacecolor=PURPLE, markersize=9, label="Drivers who normally use this lane"),
                    Line2D([], [], marker="o", color="none", markerfacecolor=GREY, markersize=7, label="Other traffic"),
                    Line2D([], [], color="black", linewidth=5, label=f"Closed {'lane' if SITE else 'block'}")],
           loc="lower center", ncol=3, frameon=False, fontsize=10, bbox_to_anchor=(0.5, 0.02), handletextpad=0.4, columnspacing=1.8)
fig.text(0.99, 0.005, "Map data © OpenStreetMap contributors", ha="right", fontsize=7, color="#777")
if args.queues:
    fig.legend(handles=[Line2D([], [], color=c, linewidth=w, label=words) for c, w, words in QUEUE], title="How fast cars moved on each block over the last 2 minutes",
               loc="lower center", ncol=4, frameon=False, fontsize=10, title_fontsize=10, bbox_to_anchor=(0.5, 0.075), handletextpad=0.6, columnspacing=1.6)
fig.subplots_adjust(left=0.01, right=0.99, top=0.9, bottom=0.26 if args.queues else 0.15, wspace=0.03)


seen = [set(), set()]   # diverted cars that have appeared so far, per panel


def draw(i):
    t = times[i]
    for st, q in zip(streets, (base_q, clos_q)):
        level = levels(q, t)
        st.set_color([QUEUE[level[i]][0] for _, i in in_block]); st.set_linewidth([QUEUE[level[i]][1] for _, i in in_block])
    for k, (sc, tr, dv, run) in enumerate(zip(scat, trails, divs, (base, clos))):
        fr = run[t]
        plain = [(x, y) for vid, x, y, _ in fr if vid not in diverted]
        purple = [(x, y) for vid, x, y, _ in fr if vid in diverted]
        seen[k].update(vid for vid, *_ in fr if vid in diverted)
        first = max(0, i - args.trail // args.step) if args.trail else 0
        past = [(x, y) for tt in times[first:i] for vid, x, y, _ in run[tt] if vid in diverted]
        sc.set_offsets(plain or [[-1e6, -1e6]])
        dv.set_offsets(purple or [[-1e6, -1e6]])
        tr.set_offsets(past or [[-1e6, -1e6]])
    label.set_text(f"{clock(t - t0, seconds=True)}    {len(seen[1])} drivers diverted so far")
    return scat + trails + divs + streets + [label]


os.makedirs(OUT, exist_ok=True)
out = os.path.join(OUT, (f"clip-{args.hour:g}" if SITE else f"swanston-clip-{args.hour:g}") + (f"-x{args.scale:g}" if args.scale != 1 else "") + ("-queues" if args.queues else "") + ".gif")
FuncAnimation(fig, draw, frames=len(times), blit=False).save(out, writer=PillowWriter(fps=args.fps), dpi=72)
print(out, os.path.getsize(out) // 1024, "KB")
if args.copy_to:
    import shutil
    shutil.copy(out, args.copy_to); print("copied to", args.copy_to)
