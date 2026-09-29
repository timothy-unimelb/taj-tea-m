#!/usr/bin/env python3
"""Run any command with a memory and time limit. Use it for heavy jobs that are not SUMO runs.

    python3 capped.py --max-mem-gb 4 --max-minutes 15 -- python3 03_demand.py

Kills the whole process group if its total memory goes over the limit. (A SUMO run without limits once used
300 GB and crashed the laptop. SUMO runs go through 04_run.py, which has its own limits.)
"""
import argparse, os, signal, subprocess, sys, time

ap = argparse.ArgumentParser()
ap.add_argument("--max-mem-gb", type=float, default=4.0)
ap.add_argument("--max-minutes", type=float, default=20.0)
ap.add_argument("cmd", nargs=argparse.REMAINDER)
args = ap.parse_args()
cmd = args.cmd[1:] if args.cmd[:1] == ["--"] else args.cmd


def group_gb(pgid):
    out = subprocess.run(["ps", "-o", "pgid=,rss=", "-A"], capture_output=True, text=True).stdout.split("\n")
    return sum(int(r.split()[1]) for r in out if r.split() and int(r.split()[0]) == pgid) / 1024 / 1024


proc = subprocess.Popen(cmd, start_new_session=True)
start, peak = time.time(), 0.0
while proc.poll() is None:
    time.sleep(2)
    peak = max(peak, group_gb(proc.pid))
    minutes = (time.time() - start) / 60
    if peak > args.max_mem_gb or minutes > args.max_minutes:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        sys.exit(f"STOPPED: {'memory %.1f GB' % peak if peak > args.max_mem_gb else 'time %.0f min' % minutes} over the limit")
print(f"exit {proc.returncode}, peak memory {peak:.2f} GB, {(time.time() - start) / 60:.1f} min", file=sys.stderr)
sys.exit(proc.returncode)
