#!/usr/bin/env python3
"""Made-up traffic for an illustration clip: the drivers who use the closed lane, several times over.

    SUMO_SITE=smac python3 11_illustration_demand.py --times 5
    export SUMO_SITE=smac SUMO_WORK=$PWD/work/smac_boost SUMO_OUT=$PWD/output/smac/illustration
    python3 04_run.py base --hour 11.5 --seed 1 --fcd 10
    python3 04_run.py signed --hour 11.5 --seed 1 --fcd 10
    python3 09_clip.py --scenario signed --hour 11.5 --seed 1 --start 40 --minutes 6 --centre=-37.7994,144.9649 --radius 250 \\
        --queues --subtitle "illustration with heavier traffic" --copy-to ../../public/assets/sumo-smac-clip.gif

At the demo site the closed lane carries about 150 cars an hour and the detour streets cope, so the real clip
shows no queues. This script copies every driver who uses the closed lane --times over, in the normal and the
closure route files, and leaves all other traffic as measured. The normal street still flows and the closure
queues the detour streets, which shows what the tool would draw at a busier site. The numbers are not a
result. Nothing in the report or the app's impact files comes from these runs: they live in their own folder
(work/<site>_boost). The clip says "illustration" in its title, and so does its caption in the report (sites/smac.json).
"""
import argparse, copy, os, random, xml.etree.ElementTree as ET
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("--times", type=int, default=5, help="how many of each closed-lane driver there are afterwards")
ap.add_argument("--scenarios", nargs="+", default=["base", "signed"])
args = ap.parse_args()

out_dir = WORK + "_boost"
os.makedirs(out_dir, exist_ok=True)
for f in ("net.net.xml", "net_closed.net.xml"):   # the same streets
    if not os.path.exists(os.path.join(out_dir, f)):
        os.symlink(os.path.join(WORK, f), os.path.join(out_dir, f))

closed, _ = find_closed_edges(load_net())
base = ET.parse(os.path.join(WORK, "base.rou.xml")).getroot()
users = {v.get("id") for v in base.iter("vehicle") if set(v.find("route").get("edges").split()) & set(closed)}
print(len(users), "drivers use the closed lane over the day; each becomes", args.times)
for name in args.scenarios:
    root = base if name == "base" else ET.parse(os.path.join(WORK, name + ".rou.xml")).getroot()
    random.seed(1)   # the same copies, at the same times, in every scenario
    rest, cars = [c for c in root if c.tag != "vehicle"], [c for c in root if c.tag == "vehicle"]
    extra = []
    for v in cars:
        if v.get("id") in users:
            for k in range(1, args.times):
                c = copy.deepcopy(v)
                c.set("id", f"{v.get('id')}b{k}")
                c.set("depart", f"{max(0, float(v.get('depart')) + random.uniform(-150, 150)):.1f}")   # spread over five minutes
                extra.append(c)
    out = ET.Element("routes")
    out.extend(rest); out.extend(sorted(cars + extra, key=lambda v: float(v.get("depart"))))
    ET.ElementTree(out).write(os.path.join(out_dir, name + ".rou.xml"))
    print(os.path.join(out_dir, name + ".rou.xml"), len(cars) + len(extra), "cars")
