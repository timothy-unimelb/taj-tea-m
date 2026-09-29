#!/usr/bin/env python3
"""Run one SUMO simulation (base or closure) for one random seed and one hour.

Simulates a 30 minute warm-up, the chosen hour, then 30 minutes to let cars finish.
Outputs go to work/runs/<scenario>_h<hour>_x<scale>_s<seed>/ :
  tripinfo.xml   one line per vehicle (duration, time loss, route length)
  edgedata.xml   counts and times per edge for the hour
  queues.xml     per-lane jam length every 5 minutes (detectors near the closed block)
  vehroute.xml   the last route each vehicle drove (used to count who used the closed block)
  summary.xml    network summary every minute (running, waiting, teleports)
  log.txt        SUMO log

Safety limits (added 30 Sep after a run grew to 300 GB of memory and crashed the laptop):
  --max-mem-gb   kill SUMO if it uses more memory than this (default 3 GB)
  --max-minutes  kill SUMO if it runs longer than this (default 20)
  Cars that cannot enter the network within 5 minutes are dropped and counted,
  instead of waiting in memory forever. Only each car's last route is kept.
"""
import argparse, math, os, signal, subprocess, sys, time
from common import *

ap = argparse.ArgumentParser()
ap.add_argument("scenario", choices=["base", "closure"])
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--hour", type=int, default=8, help="clock hour to report, e.g. 8 for 8am to 9am")
ap.add_argument("--scale", type=float, default=1.0, help="share of the sampled demand to insert")
ap.add_argument("--teleport", type=int, default=300, help="seconds stuck before a vehicle is teleported")
ap.add_argument("--max-mem-gb", type=float, default=3.0)
ap.add_argument("--max-minutes", type=float, default=20.0)
ap.add_argument("--queue-radius", type=float, default=600.0)
args = ap.parse_args()

tag = f"{args.scenario}_h{args.hour}_x{args.scale:g}_s{args.seed}"
run = os.path.join(WORK, "runs", tag)
os.makedirs(run, exist_ok=True)
netfile = NET if args.scenario == "base" else os.path.join(WORK, "net_closed.net.xml")
routes = os.path.join(WORK, f"{args.scenario}.rou.xml")

net = load_net()
closed_ids, junction = find_closed_edges(net)
jx, jy = junction.getCoord()

# Simulation time 0 is 6am (see 03_demand.py).
t0 = (args.hour - SIM_START_H) * 3600
begin, report_end, end = t0 - 1800, t0 + 3600, t0 + 3600 + 1800

# ---- additional file: edge data for the hour + jam detectors near the closed block --------------
add = os.path.join(run, "additional.xml")
with open(add, "w") as f:
    f.write("<additional>\n")
    f.write(f'  <edgeData id="ed" file="{run}/edgedata.xml" begin="{t0}" end="{report_end}" excludeEmpty="true"/>\n')
    n = 0
    for e in net.getEdges():
        if not e.allows("passenger"):
            continue
        cx, cy = e.getShape()[len(e.getShape()) // 2]
        if math.hypot(cx - jx, cy - jy) > args.queue_radius:
            continue
        for l in e.getLanes():
            if l.allows("passenger") and l.getLength() > 8:
                f.write(f'  <laneAreaDetector id="q_{l.getID()}" lane="{l.getID()}" pos="0" length="{l.getLength() - 0.2:.1f}" '
                        f'period="300" file="{run}/queues.xml" friendlyPos="true" jamThreshold="0.5"/>\n')
                n += 1
    f.write("</additional>\n")
print("jam detectors:", n)

# Call the SUMO binary itself (not the pip wrapper) so the memory check sees the real process.
sumo_bin = os.path.join(os.environ["SUMO_HOME"], "bin", "sumo")
cmd = [sumo_bin, "-n", netfile, "-r", routes, "-a", add, "--seed", str(args.seed),
       "--begin", str(begin), "--end", str(end), "--scale", str(args.scale),
       "--step-length", "1", "--no-step-log", "--no-warnings",
       "--tripinfo-output", f"{run}/tripinfo.xml",
       "--vehroute-output", f"{run}/vehroute.xml", "--vehroute-output.last-route", "true",
       "--vehroute-output.exit-times", "false",
       "--summary-output", f"{run}/summary.xml", "--summary-output.period", "60",
       "--time-to-teleport", str(args.teleport),
       "--time-to-teleport.disconnected", "60",  # a car whose route the closure cut can't stall the run
       "--max-depart-delay", "300", "--ignore-route-errors", "true",
       "--collision.action", "warn",
       "--device.rerouting.probability", "1.0",
       "--device.rerouting.period", "300", "--device.rerouting.pre-period", "0",
       "--device.rerouting.adaptation-interval", "60", "--device.rerouting.adaptation-steps", "5",
       "--device.rerouting.threads", "2",
       "--tls.actuated.jam-threshold", "30",
       "--log", f"{run}/log.txt"]
print(" ".join(cmd))


def rss_gb(pid):
    out = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return int(out) / 1024 / 1024 if out else 0.0


proc = subprocess.Popen(cmd, cwd=run, start_new_session=True)
start, peak = time.time(), 0.0
while proc.poll() is None:
    time.sleep(2)
    peak = max(peak, rss_gb(proc.pid))
    minutes = (time.time() - start) / 60
    if peak > args.max_mem_gb or minutes > args.max_minutes:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        why = f"memory {peak:.1f} GB > {args.max_mem_gb} GB" if peak > args.max_mem_gb else f"time {minutes:.0f} min > {args.max_minutes} min"
        sys.exit(f"STOPPED {tag}: {why}. The network is probably gridlocked. Try a smaller --scale.")
print(f"{tag}: exit {proc.returncode}, peak memory {peak:.2f} GB, {(time.time() - start) / 60:.1f} min")
sys.exit(proc.returncode)
