# SUMO simulation of the Swanston St closure

An experiment. It simulates cars around the sample TGS closure (Swanston St closed between La Trobe St and Little La Trobe St) with and without the closure, and turns the difference into the app's impact result (`model/IMPACT_CONTRACT.md`).

**Status: early result, low confidence.** Plugged into the app as `IMPACT_MODEL=sumo` (precomputed, Swanston sample only), and the app's default for this sample. Since 30 Sep 6am, traffic is fitted to measured car counts per approach, not whole-intersection totals. Since 30 Sep 9am every turn has a source, signals respond to traffic, and the simulation's own traffic is checked against the counts. The app still shows the 7:45am numbers until the team reviews the new ones.

## What it does

1. Downloads OpenStreetMap for the CBD and builds a SUMO street network (cars and trams, left-hand traffic) with sourced turn rules and delay-based signals (see "Turn rules").
2. Builds weekday traffic that matches SCATS signal counts at 52 CBD signal sites, hour by hour (SUMO routeSampler). At the 9 junctions around the closure it uses car counts per approach from individual SCATS detectors (see "Car counts per approach" below). The other 43 sites use whole-site totals cut to cars only.
3. Makes two versions of the same traffic: the normal street, and one where the Swanston St car lane on the closed block is shut. Trips that used the block get a new route. Trips that end at a place the closure cuts off are removed from both.
4. Runs both for one hour (default 8am to 9am) after a 30 minute warm-up, for several random seeds, and checks what the normal runs carry against the counts (`08_check_counts.py`).
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
bash 02_build_net.sh          # SUMO network: left-hand traffic, delay-based signals, turn rules (07_turn_rules.py)
python3 00_detector_counts.py # car counts per approach (downloads one month of SCATS counts, 135 MB)
python3 capped.py -- python3 03_demand.py   # traffic fitted to the counts (about 1.5 minutes, 1.4 GB)
for hour in $(seq 7 21); do for seed in 1 2 3 4 5; do   # every hour of the works, 7am to 10pm
  python3 04_run.py base --hour $hour --seed $seed
  python3 04_run.py closure --hour $hour --seed $seed
done; done
python3 08_check_counts.py --hours $(seq 7 21) --seeds 1 2 3 4 5   # simulated traffic vs the counts, output/calibration.json
python3 05_to_impact_json.py --hours $(seq 7 21) --seeds 1 2 3 4 5
python3 06_plot.py --hour 8 --seeds 1 2 3 4 5
cp output/swanston.json ../../data/impact/sumo-swanston.json   # what the app shows
```

The runs are independent, so `xargs -P 4` can run four at a time (each is capped by `04_run.py`).

**Sensitivity case: right turn allowed.** The network bans the right turn from westbound La Trobe St into Swanston St, because site 2921's signal sheet shows no car right-turn signal (`turn_rules.json`). To run the same thing with the turn allowed, build a second network with that rule skipped and point every script at its folder:

```bash
mkdir -p work/allowed && cp work/approach_counts.json work/allowed/
export SUMO_WORK=$PWD/work/allowed SUMO_OUT=$PWD/work/allowed/output
bash 02_build_net.sh --allow 2921-latrobe-westbound-right-ban
python3 capped.py -- python3 03_demand.py
# ...the same 04_run.py loop, then 05_to_impact_json.py
unset SUMO_WORK SUMO_OUT
python3 05_to_impact_json.py --hours $(seq 7 21) --seeds 1 2 3 4 5 --allowed-summary work/allowed/output/summary.json
```

`SUMO_WORK` and `SUMO_OUT` point every script at another folder. `TLS_TYPE=static bash 02_build_net.sh` gives the old fixed 90 s signal cycles.

`04_run.py --scale 0.5` inserts half the traffic. `03_demand.py --site-totals` goes back to whole-site totals everywhere. `work/` holds everything generated and is not committed.

## Turn rules

Which turns cars may make, and from which lane, decides who can use the closed block at all. Every turn into or out of it now has a source (`07_turn_rules.py check` prints the table, saved in `work/turn_rules_report.json`):

| Turn | Allowed? | Source |
|---|---|---|
| Westbound La Trobe St, right into the block | No | DTP signal sheet DOC/24/198884 for site 2921: no car right-turn signal group, only a bike hook turn. Confirmed on Google Street View, Nov 2025 imagery: No Right Turn and straight-ahead-only signs on the approach (`output/2921-latrobe-westbound-signs-streetview-nov2025.png`). |
| Eastbound La Trobe St, left into the block | Yes | OpenStreetMap way connectivity, no restriction tagged |
| Out of the block, straight on up Swanston St | Yes | OpenStreetMap |
| Out of the block, left into Little La Trobe St | Yes | OpenStreetMap |

Where the rules come from, in order:

1. **Left-hand traffic.** Until 30 Sep 8am the network was built for right-hand traffic (netconvert's default), so every turn that crosses oncoming cars was mirrored: the shortcut right turn into the block was treated as an easy turn, and left turns as crossing ones. `--lefthand` fixes the geometry, the lane order and which turns the signals protect.
2. **OpenStreetMap turn restrictions.** The extract has 63 `type=restriction` relations. netconvert applies the ones it can resolve while importing; it silently drops those whose way is not split at the via node, or that turn across a divided road through a via way (20 relations here, including La Trobe St into Elizabeth St and the bans that keep cars off the tram-only parts of Swanston St). `07_turn_rules.py resolve` matches every relation to the built network by way id, or by street name, geometry and direction of travel, and applies the missed ones in a second netconvert pass. `check` then verifies each one: 39 applied for cars, 11 outside the cut network, 12 on tram-only, permit-only or pedestrian-only ways (nothing to ban for cars), 1 time-limited (Russell St into Collins St, weekday afternoons, which SUMO cannot express).
3. **OpenStreetMap lane arrows** (`turn:lanes`, netconvert `--osm.turn-lanes`): which lane each turn is made from. At Elizabeth St / La Trobe St these already put the right turns on the kerb lane, as hook turns.
4. **DTP signal sheets** (`turn_rules.json`, applied by `07_turn_rules.py`): what the sheets show and OpenStreetMap does not carry. One ban (above) and hook turns at Russell St / La Trobe St (two hook-turn boxes on the sheet) and Elizabeth St / La Trobe St (three boxes: two Elizabeth St approaches from OpenStreetMap, one La Trobe St approach, the other La Trobe St right turn being banned). Only these three of the nine junctions with a sheet had their turn signals read; the other six use OpenStreetMap only.

**Hook turns.** In a Melbourne hook turn the driver keeps to the kerb lane, waits in a box at the far side of the junction, and turns right when the cross street gets green. The model moves the right-turn connection to the kerb lane. The box itself is not modelled: a waiting hook turner sits at the stop line in the kerb lane, so kerb-lane capacity is understated at those approaches while a turn waits. SUMO has no hook-turn phase; the turn gets the same permissive green plus a short protected window that netconvert gives every crossing turn.

## Watching it

Two ways to see the simulation rather than its numbers:

- **Live, in SUMO's viewer:** `python3 04_run.py closure --hour 17 --seed 1 --gui --max-minutes 60` opens the run in sumo-gui, zoomed on the block, with the same memory and time limits. On a Mac the bundled sumo-gui is an X11 program, so it needs XQuartz (installed on the laptop 30 Sep 9:50am). Start XQuartz first, and until you have logged out and in again after installing it, run with `DISPLAY=:0` in front of the command.
- **A recorded clip:** run an hour with `--fcd 10` for both scenarios (`python3 04_run.py base --hour 17 --seed 6 --fcd 10`, then `closure`), then `python3 09_clip.py --hour 17 --seed 6 --minutes 5`. It writes `output/swanston-clip-17.gif`: five simulated minutes, normal street on the left and closure on the right, cars as dots coloured by speed. Cars that drive through the block in the normal run are pink on the left and purple on the right, with a trail of their recent path, so you can see them go around it. The closed block is drawn only on the right. The clip on the app's report uses the sensitivity case (right turn allowed, `SUMO_WORK=work/allowed`, `--subtitle "right turn from La Trobe St allowed"`), because in the main case only a car or two a minute is affected and the two panels look the same. Delete the `fcd.xml` files afterwards, they are about 200 MB each.

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

## Calibration check

`03_demand.py` fits routes to the counts before simulating (routeSampler reports 100% of counted edges within GEH 5 in every hour). That says nothing about what the simulation then carries: cars get dropped at the entry, queue, or reroute. `08_check_counts.py` compares what the normal runs actually carried on every counted edge, per hour, with the count target (`output/calibration.json`). GEH is the usual fit measure for traffic counts; under 5 passes for a modelled link.

Weekday works hours, 5 seeds, delay-based signals, the turn rules above (30 Sep, 9am):

| Measure | Result | PLAN.md 6b target |
|---|---|---|
| Counted street-hours within GEH 5 | 71% (91% within GEH 10, mean GEH 3.8) | most |
| Worst hour (5pm to 6pm) within GEH 5 | 54% | |
| Cars dropped (could not enter within 5 minutes) | under 2% in 11 of 15 hours; 5% to 7% from 3pm to 6pm, 2.4% at 8am | under 2% |
| Mean speed | 10 to 14 km/h off peak, 7 to 8 km/h from 3pm to 6pm (16% to 34% of the limit) | a CBD peak |

So the first target is met, the second outside the afternoon peak, the third not yet. The counts still fail along Victoria St, the network's northern edge, in 12 of 15 hours (carrying 55% to 65% of the count): both approaches to Victoria St / Swanston St crawl while everything downstream flows freely, so the signal program of that big joined junction is the bottleneck. The over-served streets are Queen St at Lonsdale St, A'Beckett St at Queen St and Queensberry St at Bouverie St, where rerouted cars pile up.

What the check found and fixed along the way (each step measured on one seed, static signals unless said):

| Step | Street-hours within GEH 5 | Dropped, worst hour | Mean speed |
|---|---|---|---|
| Old network (right-hand traffic, fixed signals, 5 seeds) | 77% | 16% | 9.3 km/h |
| Left-hand traffic and turn rules | 59% | 19% | 6.2 km/h |
| + boundary sites split over every approach, cars off permit-only Swanston St | 64% | 12% | 7.6 km/h |
| + sites with only side-street detectors left unconstrained | 71% | 8% | 8.1 km/h |
| + delay-based signals (5 seeds) | 71% | 7% | 9.6 km/h |

The old network matched the counts better only because cars were driving on the wrong side, through the tram-only blocks of Swanston St, and past 16% dropped. The fixes:

- **Boundary sites.** A site's approaches are now every car edge that ends within 45 m of it, including edges that enter the network at its cut edge. Before, only the edges into the nearest node counted, so a site on a divided junction or at the boundary put its whole total on one approach: Elizabeth St / Queensberry St put 23,700 cars a day on Queensberry St alone, and the sampler fed them in through Berkeley St, a one-lane street, at 1,480 an hour.
- **Side-street sites.** Five unmeasured sites (Queen St, Russell St and King St at the little streets, Elizabeth St / Franklin St) have whole-site totals of 800 to 1,400 cars a day, which means only the side street has detectors (the sheets for 2906 and 4512 show Elizabeth St with none). Splitting such a total gave Queen St 165 cars a lane a day and starved it. Sites whose split gives fewer than 600 cars a lane a day are left unconstrained (`--min-lane-daily`).
- **Permit-only Swanston St.** OpenStreetMap tags those blocks `access=permit`, which netconvert reads as open. Cars are now kept off them (`07_turn_rules.py access`), so the zero targets there are met by construction.
- **Signals.** SUMO's gap-based actuated control cannot skip phases, and netconvert builds seven green phases for the big joined CBD junctions, so most of each cycle was wasted. Delay-based control holds green while delayed cars keep arriving and skips empty phases: on the three worst hours it halved teleports and dropped cars against gap-based control.

Cars entering the closed block are counted in the base runs, so they are unaffected by the closure runs' health. Delay and queue are still within noise.

## Findings so far

Weekday works hours, 7am to 10pm: every hour simulated separately, 5 random seeds, full counted traffic, delay-based signals and the turn rules above (`output/summary.json`, 30 Sep 9am). The main case bans the right turn from westbound La Trobe St into Swanston St, as site 2921's signal sheet shows. The same runs with that turn allowed are the sensitivity case (`work/allowed/output/`).

| | Right turn banned (main case) | Right turn allowed (sensitivity) |
|---|---|---|
| Drivers who must avoid the closed block, 7am to 10pm | 110 to 162 (median 123) | 972 to 1,129 (median 1,077) |
| Busiest hours | 6pm (about 34), 8am (about 30) | 4pm and 9am (about 145), 5pm (about 120) |
| Extra distance each | median 13 m, upper quartile 75 m | median 0 m (it is a shortcut), upper quartile 47 m |
| Extra total travel time | −436 to +361 vehicle-hours; two normal runs differ by up to 502, so noise | −415 to +653; noise |
| Queue | not reported: worst-lane growth (206 m) is no bigger than between normal runs (212 m) | not reported |
| Health of the runs | up to 8% of cars dropped and 440 teleports in one afternoon-peak run | up to 1.5% dropped |

- With the ban, the only way into the block is the left turn from eastbound La Trobe St, so the drivers are those heading for Swanston St north of the block, Little La Trobe St or A'Beckett St. Routes fitted to the counts plan 88 trips through it over the works hours; the runs see 110 to 162.
- With the turn allowed, westbound La Trobe St drivers use the block as a shortcut to A'Beckett St around La Trobe St queues, about ten times as many.
- Upper limit from counts: every car entering the block comes from La Trobe St, which carries 11,686 cars from 7am to 10pm in both directions at 2921.
- `output/swanston.json` gives the main case as the low and typical values and the allowed case as the high value (110, 123, 1,077). Delay and queue are left out because they cannot be told apart from noise.
- Compared with the 7:45am result the app still shows (755 to 871 allowed, 71 to 92 banned): the banned case rose from about 77 to about 123 because the left turn from eastbound La Trobe St is now the easy, non-crossing turn it is on the street; the allowed case rose from about 810 to about 1,080. The order of the answer has not changed: tens to a hundred-odd cars a day unless the right turn is allowed.

What this says: the closed block matters little for cars, and whether it matters at all depends on one turn rule. The lookup model's estimate (about 10,100 diversions a day) assumed half of site 2921's 46,939 counted vehicles use Swanston St. The measured car count on La Trobe St is 13,742 a day in both directions together, and only turning traffic can enter the block. So the lookup's figure is not possible here.

## Not yet credible

The plan to fix these, in order, is PLAN.md step 6b (less janky) and then 6c (any site).

- **No count constrains the closed lane.** The range is how many simulated drivers enter it, which depends on simulated queues.
- **The right-turn-allowed case is a what-if, not a possible reading of the street.** Site 2921's signal sheet shows no car right-turn signal from westbound La Trobe St, and Street View (Nov 2025) shows a No Right Turn sign on the approach. So the main case is the street as it is. The allowed case shows how much the block would matter if that ban were lifted, about ten times more, and is the only reason to keep the sensitivity figure in the report's range.
- **The afternoon peak is still too congested.** From 3pm to 6pm 5% to 7% of cars are dropped and speeds are about 7 km/h. Victoria St, the northern edge, carries about 60% of its count because the joined Victoria St / Swanston St junction's signal program cannot serve it. The 40 sites without a sheet still use whole-site totals times 0.57.
- **Hook turns have no box.** A waiting hook turner blocks the kerb lane at the stop line.
- **Some sheets are old or don't match the counts.** 4523's sheet is from 2019 and three of its detectors that are off on the sheet now count traffic. Elizabeth St at 2906 and 4512 has no car detectors. Only 3 of the 9 sheets had their turn signals read.
- **Delay and queue are within noise.**
- **No trams, pedestrians or trucks.** SUMO can do all three. Trams would need PTV GTFS timetables. City of Melbourne pedestrian sensor 187 (330 Swanston St, 21 m from the site) counts about 8,000 people a weekday.

## History

- 30 Sep, 9am: turn rules with a source everywhere (left-hand traffic, OpenStreetMap restrictions including 20 netconvert dropped, lane arrows, the sheet's right-turn ban, hook turns), delay-based signals, cars off permit-only Swanston St, and a check of simulated traffic against the counts (71% of street-hours within GEH 5). Demand fixes for boundary and side-street sites. The right-turn ban is now the main case and the allowed turn the sensitivity case.
- 30 Sep, 7:45am: every hour of the works (7am to 10pm) simulated, with the La Trobe St right turn allowed and banned. Delay is left out of the result when it is noise.
- 30 Sep, 6am: traffic fitted to car counts per approach from SCATS detectors and DTP signal sheets at 9 junctions. Full traffic now runs without gridlock in about 30 seconds. Diversions are now the shortcut drivers seen in normal runs.
- First attempt (30 Sep, before 4am): 16 hours of traffic, about 500,000 trips, network to Spring St. Gridlocked and used 300 GB of memory.
- The Spring St / Nicholson St / Victoria Pde junctions at the east edge gridlocked first, even at 30% traffic. The network is now cut at Exhibition St.
- Guessed signals at tram crossings and merged junctions still jammed Elizabeth/La Trobe and Queen/La Trobe. Now only OpenStreetMap signals, fixed 90 s cycles and no internal junction lanes.

## Assumptions

- Signals are SUMO's delay-based actuated control (green held while delayed cars keep arriving, empty phases skipped), with netconvert's phase layout, not the real SCATS plans.
- Turn rules: OpenStreetMap restrictions and lane arrows, plus the three sheets read for turn signals (`turn_rules.json`). The right turn from westbound La Trobe St into Swanston St is banned. Hook turns are made from the kerb lane without a box.
- At the 9 junctions with a sheet, counts are per approach from car stop-line detectors. At 34 other sites, whole-site totals times 0.57 are split across the site's approaches by lane count. 26 sites are left unconstrained: near the network edge, or with a total so small that only the side street can have detectors.
- Cars are kept off the blocks of Swanston St that OpenStreetMap tags permit-only. The closed block is tram only except for one northbound car lane, which cars can enter only by turning left from eastbound La Trobe St. Only that lane is closed. Trams keep running but no tram services are simulated.
- All vehicles are cars. No pedestrians, cyclists, trams or trucks.

## Data and tools

Eclipse SUMO (EPL-2.0), OpenStreetMap data (ODbL, © OpenStreetMap contributors), pyproj (MIT), matplotlib (PSF-based licence), SCATS counts per detector (DTP Traffic Signal Volume Data, CC-BY 4.0), DTP Traffic Signal Configuration Data Sheets (CC-BY 4.0). All listed in THIRD_PARTY.md.
