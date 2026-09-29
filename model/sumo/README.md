# SUMO simulation of the Swanston St closure

An experiment. It simulates cars around the sample TGS closure (Swanston St closed between La Trobe St and Little La Trobe St) with and without the closure, and turns the difference into the app's impact result (`model/IMPACT_CONTRACT.md`).

**Status: early result, low confidence.** Plugged into the app as `IMPACT_MODEL=sumo` (precomputed, Swanston sample only). The default model is still Tamara's lookup.

## What it does

1. Downloads OpenStreetMap for the CBD and builds a SUMO street network (cars and trams).
2. Builds weekday traffic that matches SCATS signal counts at 52 CBD signal sites, including 2921 SWANSTON/LATROBE, hour by hour (SUMO routeSampler).
3. Makes two versions of the same traffic: the normal street, and one where the Swanston St car lane on the closed block is shut. Trips that used the block get a new route. Trips that end at a place the closure cuts off are removed from both.
4. Runs both for one hour (default 8am to 9am) after a 30 minute warm-up, for several random seeds.
5. Compares the same trips across the two runs: extra travel time, how many drivers had to avoid the block, extra distance, and queue growth.
6. Writes `output/swanston.json` (ImpactResult), `output/summary.json` (raw numbers) and `output/swanston-closure.png` (slide image).

## How to run

About 190 MB of downloads. Needs Python 3.

```bash
cd model/sumo
python3 -m venv .venv
.venv/bin/pip install eclipse-sumo pyproj matplotlib
source env.sh
bash 01_fetch_osm.sh          # OpenStreetMap extract, not committed
bash 02_build_net.sh          # SUMO network
python3 03_demand.py          # traffic fitted to SCATS counts (about 2 minutes, 2 GB)
for seed in 1 2 3; do
  python3 04_run.py base --hour 8 --seed $seed
  python3 04_run.py closure --hour 8 --seed $seed
done
python3 05_to_impact_json.py --hour 8 --seeds 1 2 3
python3 06_plot.py --hour 8
```

`04_run.py --scale 0.5` inserts half the traffic. `work/` holds everything generated and is not committed.

## Safety limits

The first run on 30 Sep grew to 300 GB of memory and crashed the laptop. It had about 500,000 trips over 16 hours, the network gridlocked, cars that couldn't enter waited in memory forever, and every rerouted car kept its old routes. Now:

- `04_run.py` kills SUMO above 3 GB (`--max-mem-gb`) or after 20 minutes (`--max-minutes`).
- It simulates one hour, not 16.
- Cars that can't enter within 5 minutes are dropped (`--max-depart-delay 300`).
- Only each car's last route is kept.

A normal one-hour run now takes 1 to 4 minutes and under 0.5 GB.

## Findings so far

Weekday 8am to 9am, 6 random seeds, 50% of the counted traffic (`output/summary.json`). Reviewed by a second session on 30 Sep; its fixes are applied.

| | Result |
|---|---|
| Drivers who must avoid the closed block | tens to about a hundred an hour (44 to 100). No counter measures this lane. |
| Extra distance each | 7 m shortest way round; simulated drivers went 114 m typical, 377 m upper quartile, with live rerouting |
| Extra total travel time | −81 to +41 vehicle-hours across seeds: too small to separate from run-to-run variation |
| Queue | not reported: two normal runs differ by 114 to 205 m on their worst lane, as much as any closure effect |
| Teleports (cars stuck 5 minutes) | 36 to 72 per run |

What this says: the block's only car lane is a short northbound lane that must exit at Little La Trobe St or A'Beckett St. The rest is tram only, and Swanston St south of La Trobe St is permit only. So few cars use it. The lookup model's estimate (about 10,100 diversions a day) assumes half of site 2921's traffic uses Swanston St, but that traffic is on La Trobe St. The detector-level SCATS counts for site 2921 (the right-turn lane from La Trobe St westbound) would settle the real number.

## Not yet credible

- **No count constrains the closed lane.** SCATS counts are intersection totals, and routeSampler used the lane to fill the La Trobe St counts. 708 of the 1,067 daily trips through it share one origin and destination street, and one hour has 301 while others have 22 to 103. Hence the wide diversion range.
- **The demand split overloads one approach.** At site 2921 the whole count lands on the two La Trobe St approaches, since both Swanston St approaches are tram only. OSM codes the eastbound one as one lane (about 800 cars an hour), against a target of 1,636 at full traffic. So the 50% run carries about a third of the count at this junction, and about 12% of cars never enter. Real signal plans and per-approach detector counts would fix this.
- **Delay and queue are within noise.**
- **Trips that lose access are removed, not counted.** The closed lane is the only car entry to Little La Trobe St and the east end of A'Beckett St.
- **One hour only.** The TGS works run 7am to 10pm.
- **No trams, pedestrians or trucks.** SUMO can do all three. Trams would need PTV GTFS timetables.
- **Permit-only section.** netconvert let cars onto the permit-only section of Swanston St south of La Trobe St (OSM way 208505379). It doesn't connect to the La Trobe junction, but it adds some unrealistic traffic.

## History

- First attempt (30 Sep, before 4am): 16 hours of traffic, about 500,000 trips, network to Spring St. Gridlocked and used 300 GB of memory.
- The Spring St / Nicholson St / Victoria Pde junctions at the east edge gridlocked first, even at 30% traffic. The network is now cut at Exhibition St.
- Guessed signals at tram crossings and merged junctions still jammed Elizabeth/La Trobe and Queen/La Trobe. Now only OpenStreetMap signals, fixed 90 s cycles and no internal junction lanes.

## Assumptions

- Signal timings are not the real SCATS plans. SUMO builds fixed or guessed plans.
- SCATS counts are whole-intersection totals. They are split across each junction's approaches by lane count.
- The closed block in OpenStreetMap is tram only except for one northbound car lane. Only that lane is closed. Trams keep running but no tram services are simulated.
- All vehicles are cars. No pedestrians, cyclists, trams or trucks.

## Data and tools

Eclipse SUMO (EPL-2.0), OpenStreetMap data (ODbL, © OpenStreetMap contributors), pyproj (MIT), matplotlib (PSF-based licence), SCATS counts (DTP, CC-BY 4.0). All listed in THIRD_PARTY.md.
