# SUMO simulation of the Swanston St closure

An experiment. It simulates cars around the sample TGS closure (Swanston St closed between La Trobe St and Little La Trobe St) with and without the closure, and turns the difference into the app's impact result (`model/IMPACT_CONTRACT.md`).

**Status: early result, low confidence.** Plugged into the app as `IMPACT_MODEL=sumo` (precomputed, Swanston sample only), and the app's default for this sample. Since 30 Sep 6am, traffic is fitted to measured car counts per approach, not whole-intersection totals.

## What it does

1. Downloads OpenStreetMap for the CBD and builds a SUMO street network (cars and trams).
2. Builds weekday traffic that matches SCATS signal counts at 52 CBD signal sites, hour by hour (SUMO routeSampler). At the 9 junctions around the closure it uses car counts per approach from individual SCATS detectors (see "Car counts per approach" below). The other 43 sites use whole-site totals cut to cars only.
3. Makes two versions of the same traffic: the normal street, and one where the Swanston St car lane on the closed block is shut. Trips that used the block get a new route. Trips that end at a place the closure cuts off are removed from both.
4. Runs both for one hour (default 8am to 9am) after a 30 minute warm-up, for several random seeds.
5. Compares the same trips across the two runs: extra travel time, how many drivers had to avoid the block, extra distance, and queue growth. Two normal runs with different seeds give the noise floor: an effect smaller than that is reported as noise.
6. Writes `output/swanston.json` (ImpactResult), `output/summary.json` (raw numbers) and `output/swanston-closure.png` (slide image).

## How to run

About 330 MB of downloads. Needs Python 3.

```bash
cd model/sumo
python3 -m venv .venv
.venv/bin/pip install eclipse-sumo pyproj matplotlib
source env.sh
bash 01_fetch_osm.sh          # OpenStreetMap extract, not committed
bash 02_build_net.sh          # SUMO network
python3 00_detector_counts.py # car counts per approach (downloads one month of SCATS counts, 135 MB)
python3 capped.py -- python3 03_demand.py   # traffic fitted to the counts (about 1.5 minutes, 1.4 GB)
for seed in 1 2 3 4 5 6 7 8 9 10; do
  python3 04_run.py base --hour 8 --seed $seed
  python3 04_run.py closure --hour 8 --seed $seed
done
python3 05_to_impact_json.py --hour 8 --seeds 1 2 3 4 5 6 7 8 9 10
python3 06_plot.py --hour 8 --seeds 1 2 3 4 5 6 7 8 9 10
cp output/swanston.json ../../data/impact/sumo-swanston.json   # what the app shows
```

`04_run.py --scale 0.5` inserts half the traffic. `03_demand.py --site-totals` goes back to whole-site totals everywhere. `work/` holds everything generated and is not committed.

## Safety limits

The first run on 30 Sep grew to 300 GB of memory and crashed the laptop. It had about 500,000 trips over 16 hours, the network gridlocked, cars that couldn't enter waited in memory forever, and every rerouted car kept its old routes. Now:

- `04_run.py` kills SUMO above 3 GB (`--max-mem-gb`) or after 20 minutes (`--max-minutes`).
- It simulates one hour, not 16.
- Cars that can't enter within 5 minutes are dropped (`--max-depart-delay 300`).
- Only each car's last route is kept.
- `capped.py` gives any other heavy job (such as `03_demand.py`) the same kind of memory and time limit.

With measured car counts, a one-hour run at full traffic takes about 30 seconds and 0.1 GB.

## Car counts per approach

The SCATS site totals used before (`model/headline_stats`) add up every detector at a site. That includes bike loops, tram loops, queue loops that count the same cars again upstream, hook-turn boxes, and at 2921 a second set of detectors at the La Trobe St tram stop. So they overstate cars:

| Site | Whole-site total used before | Car stop-line detectors, Aug 2026 weekdays |
|---|---|---|
| 2921 SWANSTON/LATROBE | 46,939 | 13,742 (La Trobe St only: 6,314 eastbound, 7,428 westbound) |
| 2920 RUSSELL/LATROBE | 52,677 | 30,770 |
| 2922 ELIZABETH/LATROBE | 38,941 | 21,318 |
| 2904 SWANSTON/LONSDALE | 32,485 | 25,494 (Lonsdale St only) |

This is why the old runs jammed: at 2921 the target for the one-lane eastbound La Trobe St approach was 1,636 cars an hour at full traffic, against 348 measured.

How it works now:

1. `detector_approaches.json` lists which detectors count cars at the stop line, per approach, for 9 junctions around the closure (2904, 2906, 2913, 2914, 2920, 2921, 2922, 4512, 4523). It was read by hand from DTP's Traffic Signal Configuration Data Sheets, one PDF or HTML sheet per site. Each entry has the sheet date, a confidence and notes. Some sheets are old (2011 to 2024), and some approaches have no car detector, so they stay unconstrained.
2. `00_detector_counts.py` takes weekday hourly medians per detector from one month of DTP Traffic Signal Volume Data (August 2026) and sums them per approach.
3. `03_demand.py` gives each counted approach its measured hourly count. Where the sheet shows no general car traffic but OpenStreetMap lets cars in (the permit-only part of Swanston St), the target is zero. Other sites get their whole-site total times 0.57, the median car share at the four fully counted junctions (range 0.29 to 0.78).

The sheets for any Victorian signal site can be fetched without downloading the whole 1 to 3 GB zip for its site range: the server accepts range requests, so one site's file can be read out of the zip on its own.

Site 2921 detector 3, on the closed block's southbound side, is not a car count. It extends the southbound bike signal and the right turn, and counts about 1,800 a day, mostly bikes. No detector counts the closed northbound car lane.

## Findings so far

Weekday 8am to 9am, full counted traffic, 10 random seeds (`output/summary.json`).

| | Result |
|---|---|
| Drivers who must avoid the closed block | 21 to 97 an hour (median 64). Routes fitted to the counts plan none through it in this hour (67 a day). The drivers who use it come from westbound La Trobe St, turn right into the block and left into A'Beckett St, towards Queen St and William St: a shortcut around La Trobe St queues. |
| Upper limit from counts | Every car entering the block comes from La Trobe St, which carries 884 cars in this hour, both directions, at 2921. |
| Extra distance each | 0 m shortest way round (it is a shortcut); simulated drivers went 47 m typical, 304 m upper quartile |
| Extra total travel time | −56 to +42 vehicle-hours across seeds. Two normal runs differ by up to 68 on their own, so this is noise |
| Queue | not reported: two normal runs differ by 95 to 193 m on their worst lane |
| Cars dropped at entry | up to 12% could not enter the network within 5 minutes |
| Teleports (cars stuck 5 minutes) | 34 to 47 per run |

What this says: the closed block matters little for cars. The lookup model's estimate (about 10,100 diversions a day) assumed half of site 2921's 46,939 counted vehicles use Swanston St. The measured car count on La Trobe St is 13,742 a day in both directions together, and only turning traffic can enter the block. So the lookup's figure is not possible here.

## Not yet credible

- **No count constrains the closed lane.** The range is how many simulated drivers choose it as a shortcut, which depends on simulated queues.
- **The shortcut may not be allowed.** It needs a right turn from westbound La Trobe St into Swanston St. SUMO allows it, but site 2921's signal sheet shows no car right-turn signal there (only a bike hook turn). If cars can't make that turn, almost no car uses the block and the closure's car impact is close to zero. Check on site or with the City of Melbourne.
- **Congestion is still too high.** Mean speed in the base run is about a fifth of the speed limit and up to 12% of cars can't enter. Guessed signal timings and the 43 sites without a sheet (corrected by one average factor) are the likely causes.
- **Some sheets are old or don't match the counts.** 4523's sheet is from 2019 and three of its detectors that are off on the sheet now count traffic. Elizabeth St at 2906 and 4512 has no car detectors.
- **Delay and queue are within noise.**
- **One hour only.** The TGS works run 7am to 10pm.
- **No trams, pedestrians or trucks.** SUMO can do all three. Trams would need PTV GTFS timetables. City of Melbourne pedestrian sensor 187 (330 Swanston St, 21 m from the site) counts about 8,000 people a weekday.

## History

- 30 Sep, 6am: traffic fitted to car counts per approach from SCATS detectors and DTP signal sheets at 9 junctions. Full traffic now runs without gridlock in about 30 seconds. Diversions are now the shortcut drivers seen in normal runs.
- First attempt (30 Sep, before 4am): 16 hours of traffic, about 500,000 trips, network to Spring St. Gridlocked and used 300 GB of memory.
- The Spring St / Nicholson St / Victoria Pde junctions at the east edge gridlocked first, even at 30% traffic. The network is now cut at Exhibition St.
- Guessed signals at tram crossings and merged junctions still jammed Elizabeth/La Trobe and Queen/La Trobe. Now only OpenStreetMap signals, fixed 90 s cycles and no internal junction lanes.

## Assumptions

- Signal timings are not the real SCATS plans. SUMO builds fixed or guessed plans.
- At the 9 junctions with a sheet, counts are per approach from car stop-line detectors. At the other 43, whole-site totals times 0.57 are split across each junction's approaches by lane count.
- The closed block in OpenStreetMap is tram only except for one northbound car lane. Only that lane is closed. Trams keep running but no tram services are simulated.
- All vehicles are cars. No pedestrians, cyclists, trams or trucks.

## Data and tools

Eclipse SUMO (EPL-2.0), OpenStreetMap data (ODbL, © OpenStreetMap contributors), pyproj (MIT), matplotlib (PSF-based licence), SCATS counts per detector (DTP Traffic Signal Volume Data, CC-BY 4.0), DTP Traffic Signal Configuration Data Sheets (CC-BY 4.0). All listed in THIRD_PARTY.md.
