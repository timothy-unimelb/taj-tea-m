# Build plan

How we get from the demo to a fully working Barrier Brain. BRIEF.md says what we are building and why. This file says what to build next and in what order.

Keep it current. When a step's state changes, update it here in the same commit. Add a dated line to the log at the bottom. Refine the steps as we learn more.

State: **done**, **in progress**, **next**, **later**.

## Where things stand (30 Sep, 9:05am)

Read this first when picking up the work. All of it is on `main` (merged from `tim` on 30 Sep, 10am, with lint and build passing).

**Real**
- TGS analysis: Claude Sonnet 5.5 via Vercel AI Gateway reads an uploaded PDF, PNG or JPG (`app/api/analyse-tgs/route.ts`, prompt in `prompts/tgs-analysis.md`, output shape in `lib/tgs-analysis.ts`). About 20 s and 3.5 cents a run. "Use demo TGS" loads a saved result (`data/mock/tgs/swanston-analysis.json`) and says so.
- Impact estimate: `/api/impact` builds an ImpactRequest from the TGS analysis (nearest SCATS site by street name, `lib/impact/request.ts`) and runs the chosen model (`lib/impact/index.ts`). Default: the SUMO early result for the Swanston sample, Tamara's lookup model live for every other site. Contract in `model/IMPACT_CONTRACT.md`.
- Report: traffic numbers as ranges, one written severity rule for every model (`lib/impact/severity.ts`), "Review required" or "Not modelled" for modes no model covers, and a "How this was estimated" section with method, confidence and assumptions (`lib/data.ts` `buildReport`, `components/site-report.tsx`).
- All 9 of Raina's screens, laid out for a phone, including the PDF-style preview and Share.
- A five-minute animated clip of the SUMO simulation (5pm, right-turn-allowed case, normal street beside the closure, cars that use the block pink on the left and purple on the right, with a short trail, with a legend) under "How this was estimated" on the Swanston report. Any model can supply one through the result's optional `visual` field (`model/IMPACT_CONTRACT.md`); `model/sumo/09_clip.py` makes this one.

**Still fixed demo data**
- The demo scan ("Use demo site scan"): fills all but the last scan point, then the rest. Its safety finding and two actions are fixed Swanston copy (`data/mock/barrier-brain.json`).
- Real scans (30 Sep): one PLY or LAS site scan is measured in the browser (`lib/scan/measure.ts`) and Claude compares it with the plan (`/api/site-check`, prompt `prompts/site-check.md`). Tested only on synthetic scans (`data/test/`). No real Scaniverse export tested yet. The Claude check has not run yet (no gateway login locally); the rule fallback in `lib/site-check.ts` ran.
- Projects list: three fixed entries, and every project shows the Swanston report.
- The aerial site image on the report is artwork from the design board.
- Pedestrians, trams, buses and trucks: no model covers them. Tram streets come from a hand-made list in `lib/impact/request.ts`.

**Known limits of what is real**
- SUMO (`model/sumo/README.md`): Swanston only. Every hour of the works (7am to 10pm), fitted to measured car counts per approach at the 9 junctions around the closure, at full traffic. No counter measures the closed lane: the diversions are simulated shortcut drivers, about 810 over the works hours if cars may turn right from La Trobe St into Swanston St, about 77 if not. The signal plan shows no car right-turn signal there. Delay and queue are within noise and left out.
- SUMO refinement (30 Sep 9am, merged into `tim` 9:55am, app numbers unchanged): SUMO with left-hand traffic, sourced turn rules, delay-based signals and a check of simulated traffic against the counts (6b items 3 and 4). Right turn banned is now the main case: about 123 drivers (110 to 162) over the works hours, about 1,080 if the turn is allowed. 71% of counted street-hours within GEH 5; the afternoon peak still drops 5% to 7% of cars. Review before merging.
- Whole-site SCATS totals overstate cars by about 1.3 to 3.5 times (bikes, trams, queue loops, hook-turn boxes, duplicate detectors). Tamara's model and the app's `daily_volume` still use them.
- Tamara's model: its typical estimate does not beat "no change", it has no road closed group, and it assumes half the signal site's traffic uses the closed street, which overstates streets with little car access.
- Uploads over 4.5 MB fail on Vercel although the screen says 20 MB (step 1, Blob).

**Next, in order**
1. Decide whether the app switches to the new SUMO result (it would move the car rating from Moderate to High, see STATUS.md under Tim).
2. Answers from Tamara on the questions in step 6a, including the site-total finding.
3. Scan work: one real Scaniverse export measured offline (step 4).
4. Impact model follow-ups (step 6): SUMO credibility (6b) before other sites (6c).

**Running and checking**
- `npm run dev` (needs `vercel env pull .env.local` for the Claude call). The Claude Browser config "barrier-brain" runs it on port 3001.
- Vercel previews of `tim` need a Vercel login.
- `IMPACT_MODEL=mvm`, `sumo` or `http` (with `IMPACT_MODEL_URL`) switches the model.
- `node_modules/.bin/jiti model/check_ts_port.ts` checks the TypeScript port against the Python.
- SUMO: always run through `model/sumo/04_run.py`, which kills SUMO above 3 GB or 20 minutes. A run without limits used 300 GB and crashed the laptop.

## 1. Foundations (done)

- **done** Branch `tim` created from `raina`. It has Raina's prototype plus the work below. `main` is untouched.
- **done** Server route for Claude calls: `app/api/analyse-tgs/route.ts`, through Vercel AI Gateway.
- **done** `tim` merged into `main` on 30 Sep, 10am (fast-forward, lint and build passing). Raina's shared-doc changes (DESIGN.md "LOCKED", open questions removed, auto share dropped) came with it; the team can still revisit them.
- **done** Vercel preview deployment of `tim` runs the TGS analysis. On Vercel the OIDC token comes with each request, so the route reads it with `@vercel/oidc`.
- **later** File storage with Vercel Blob. The browser uploads straight to Blob and sends the route a link. Needed for files over 4.5 MB, which Vercel Functions reject, and for LiDAR scans. Chosen over Supabase Storage for now: same Vercel project, less setup. Revisit if we adopt Supabase for projects.
- **done** One sample site throughout. The project and report now say Swanston Street, matching the TGS.

## 2. TGS analysis with Claude (done, with follow-ups)

- **done** Claude Sonnet 5.5 reads the uploaded TGS and returns JSON: site, closure type, hours, lanes, detour, equipment, pedestrian measures, 4 to 8 scan points, unclear items. Schema in `lib/tgs-analysis.ts`. Shown on the TGS complete and scan upload screens. About 20 s and 3.5 cents per run.
- **done** PDF TGS tested: the Swanston sample as a PDF reads correctly in about 17 s.
- **done** Work hours: the prompt now tells Claude to check inset maps and notes, and the schema asks for days, start and end as separate fields. The sample reads as Monday 07:00 to 22:00.
- **done** Saved analysis of the demo TGS (`data/mock/tgs/swanston-analysis.json`). "Use demo TGS" shows it instantly and for free, and the screen says it is saved. Real uploads still go to Claude.
- **later** Recover the drawing's scale by matching it to map data (Vicmap or City of Melbourne open data). Not Google Maps: its terms ban extracting data.
- **later** Upload limit copy says 20 MB but Vercel allows 4.5 MB until Blob is in. Raina's copy is locked, so check with her.

## 3. Scan upload and coverage check (in progress, branch `joel`)

- **done** One site scan covers every scan point from the TGS analysis. Check: enough points, at least 2 m of street, kerb found.

- Upload scans to Blob (step 1).
- Check each scan covers its scan point: phone location at upload within about 15 m (BRIEF.md). Later, check the expected feature is in the scan, such as a kerb.
- Replace the fixed "4 of 5 captured" result with the real one.

## 4. Scan measurement (in progress, branch `joel`)

- **done** In TypeScript in the browser instead of Python: ground, kerb, obstacles, clear widths per 0.5 m slice (`lib/scan/measure.ts`). Works on synthetic scans. On three real Scaniverse LAS scans (Swanston St near Grattan St, iPhone 16) it finds the kerb (80 to 190 mm) but not reliable footpath widths: the street direction is found from the sharpest kerb step, and tram rails and separators confuse it. Widths are withheld when implausible. **next** Use the LAS georeference and the street's bearing from OpenStreetMap for the direction.

Plan in BRIEF.md "Scan measurement": Open3D, trimesh, laspy. Find ground, kerb and obstacles, slice every 0.5 m, output clear widths as JSON. Runs as a Vercel Python function or a small separate service.

- **first** Get one real Scaniverse export of a street and measure it offline. This proves the approach before any wiring.

## 5. Plan vs street comparison with Claude (in progress, branch `joel`)

- **done** `/api/site-check` with `prompts/site-check.md`; rule fallback. **next** Run it on Vercel with the gateway.

Claude reads the TGS analysis and the scan measurements, flags each conflict ("footpath 1.4 m clear, plan needs 1.8 m") and suggests fixes from RPM's equipment inventory. Code produces every number. Claude only explains and recommends.

## 6a. Swappable impact models (done, 30 Sep)

The app must not be locked into one traffic model. Tamara may try other approaches, and SUMO is being tested. Order agreed by Tim on 30 Sep, 3:45am:

1. **done** Impact input and output shapes (`lib/impact/types.ts`, written up in `model/IMPACT_CONTRACT.md`) and a switch, `IMPACT_MODEL`, that picks the model (`lib/impact/index.ts`). A model can be TypeScript in the app, a saved JSON result, or an outside service over HTTP. The report reads only the result, via `/api/impact`, and shows the method, confidence and assumptions.
2. **done, early result** Plug-in: SUMO simulation of the Swanston closure (`model/sumo/`, README there). Precomputed, selected with `IMPACT_MODEL=sumo`, labelled "Early result", low confidence. Since 30 Sep it is fitted to measured car counts per approach (SCATS detectors plus DTP signal sheets) at the 9 junctions around the closure, runs at full traffic without gridlock, and covers every hour of the works (7am to 10pm). About 810 drivers over the works hours (77 if the La Trobe St right turn is banned) use the block as a shortcut from La Trobe St to A'Beckett St and must go another way. Delay and queue are within run-to-run noise and left out. Not yet credible: no counter on the closed lane, the shortcut needs a right turn that the signal plan doesn't show, congestion is still too high, no trams, pedestrians or trucks. Slide image: `model/sumo/output/swanston-closure.png`.
3. **done** Plug-in: Tamara's model ported to TypeScript (`lib/impact/models/mvm-core.ts`), live, and used for every site without a SUMO result. Matches the Python example exactly (night 11.9, day 428.6, 24 hours 1,022.0 vehicle-hours; check with `node_modules/.bin/jiti model/check_ts_port.ts`). "Road closed" runs as 0 lanes open on the lookup's level 3 fallback, and the plan's own hours drive the queue. Tamara's Python files are unchanged.
4. **done** Demo consistency: Swanston naming, report text matching this TGS (tram corridor marked for review), the written severity rule (`lib/impact/severity.ts`), a saved demo analysis, and a tighter work hours prompt.

Questions for Tamara:
- The `mvm_predict.py` docstring calls the worst case P10, but the code uses P90 (least traffic avoided the site). The port follows the code, and adds P10 as the "low" end of each range. Which is intended?
- With the road fully closed, the queue model holds a 500 m queue for every hour of works, so delay mostly measures hours worked. The port ranks work windows by forced diversions in that case. Is that right?
- The lookup has no "road closed" group. Could one be built from RADAR?
- Answered from public data on 30 Sep (DTP detector counts and signal sheet for 2921): no detector counts the closed northbound lane, but only La Trobe St traffic can enter it, and La Trobe St carries 13,742 cars a day in both directions. So the lookup's 10,000 diversions a day is not possible here. The 46,939 site total counts every detector: bikes, trams, queue loops and a second set at the tram stop.
- The site totals in `headline_stats/output/02_scats_site_daily.csv` sum every detector. At the four junctions checked, cars are 29% to 78% of the total. Should the lookup's daily volume use car stop-line detectors only? The detector roles come from DTP's Traffic Signal Configuration Data Sheets (`model/sumo/detector_approaches.json` has nine CBD sites).

## 6. Impact model follow-ups

The models are connected (step 6a). Order agreed by Tim on 30 Sep, 7:30am: make SUMO trustworthy first (6b), then make it work for any site (6c). A second street with shaky numbers proves less than one street with solid ones.

### Lookup model (Tamara)

- **done** Detector-level counts for site 2921 (30 Sep). They rule out the lookup's figure for Swanston, but no detector counts the closed lane itself.
- **next** Replace the lookup model's 50% closed-street share and whole-site totals with per-approach car detector counts, so it stops overstating streets with little car access. Method and nine mapped sites in `model/sumo/detector_approaches.json`.
- A "road closed" group in the lookup, if RADAR has enough full closures.

### 6b. SUMO: less janky (first)

Why the numbers are shaky now: signal timings are guessed (fixed 90 s cycles), so the simulated CBD is too congested (mean speed about a fifth of the limit, up to 12% of cars can't enter). The headline diversions are simulated shortcut drivers, so they depend on those made-up queues and on turn rules. Each step below says how we know it worked.

1. **done** Right turn from La Trobe St into Swanston St: the same runs with it banned (`model/sumo/ban.con.xml`) give about 77 diversions over the works hours instead of about 810. The report shows the banned case as the low end. **next** Check on site or with the City of Melbourne whether cars may make that turn.
2. **done** Whole works period, 7am to 10pm. Each hour is its own run, 5 seeds; totals add up per seed. Delay is left out of the result when it can't beat the noise floor.
3. **done (30 Sep 9am, merged into `tim` 9:55am)** Turn rules everywhere. The network was built for right-hand traffic, so every crossing turn was mirrored; it is now left-hand. netconvert dropped 20 of the 63 OpenStreetMap turn restrictions (ways not split at the junction, or turns across a divided road), so `07_turn_rules.py` matches each one to the network by geometry and applies it: 39 apply to cars, 12 are on tram-only or pedestrian ways, 11 outside the cut network, 1 is time-limited. Lane arrows are read. `turn_rules.json` holds what the sheets show: the La Trobe St right-turn ban (now the main case) and hook turns at Russell St and Elizabeth St, made from the kerb lane. Cars are kept off the permit-only Swanston St blocks. Every turn into or out of the closed block has a source (README "Turn rules"). Only 3 of the 9 sheets had their turn signals read. The allowed right turn is the sensitivity case, with its own network (`02_build_net.sh --allow ...`).
4. **partly done (30 Sep 9am, in `tim`)** Signals and a real calibration check. Signals are SUMO's delay-based actuated control (gap-based actuated cannot skip phases and wasted most of each cycle at the big joined CBD junctions). `08_check_counts.py` compares what the normal runs carry on every counted edge and hour with the counts (`output/calibration.json`). It found and fixed three demand bugs: a boundary site putting its whole total on one approach (23,700 cars a day on Queensberry St, fed in through a one-lane street), side-street-only sites starving Queen St, Russell St and King St (now left unconstrained), and cars on tram-only Swanston St. Result over 5 seeds: 71% of counted street-hours within GEH 5 (91% within GEH 10), fewer than 2% of cars dropped in 11 of 15 hours but 5% to 7% from 3pm to 6pm, mean speed 10 to 14 km/h off peak and about 7 km/h in the afternoon peak. So: first target met, second met outside the afternoon peak, third not yet. **next** Victoria St, the northern edge, carries about 60% of its count because the joined Victoria St / Swanston St junction's signal program cannot serve it: fix that program (fewer phases, or a hand-written one), then the 3pm to 6pm drop rate. The 34 unmeasured sites still use whole-site totals times 0.57.
5. Queue on the detour streets (about 2 hours): average jam per lane on the streets the diverted drivers use, over seeds, against the base-vs-base noise floor. Report it only when it beats the floor.
6. More of the 52 counting sites with signal sheets read, replacing the single 0.57 correction (see 6c step 4 for how to automate it).
7. Later: routes shaped by real travel data (ABS journey to work, VISTA survey) instead of random trips fitted to counts.
8. Later: other modes, 1 to 2 days each. Trams from PTV GTFS (SUMO `gtfs2pt.py`), which fills "public transport". Pedestrians with SUMO footpaths and City of Melbourne sensor counts (sensor 187 at 330 Swanston St, 21 m from the site, about 8,000 people a weekday). Pedestrians are probably what RPM Hire cares about most. Trucks as their own vehicle type.

### 6c. SUMO: any site (after 6b)

What is Swanston-only now: `find_closed_edges` (finds this block by name), the CBD network cut at Exhibition St, the 9 hand-read signal sheets, and precomputed results only.

1. **Closure from the TGS analysis** (about half a day). Take street, extent, closure type, lanes and hours from Claude's TGS analysis. Find the junctions where the street meets each cross street, close every car lane between them (or that many lanes for "lanes closed") with SUMO's timed closures (`closingReroute`, `closingLaneReroute`) for the work hours. One network then serves every scenario. Replaces `find_closed_edges` and `net_closed.net.xml`.
2. **One config per site, one command** (about 2 hours). A JSON per site (area, closure, hours, seeds) and one script that runs every step into `work/<site>/` and `output/<site>/`. `SUMO_WORK` and `SUMO_OUT` already point the scripts at other folders.
3. **Networks outside the CBD** (about half a day, then minutes per area). Build about 1.5 km around the site, then an automatic health check: one base hour must keep speeds up and drop few cars, or the build fails. Edge-of-network gridlock crashed the laptop once, so this check is not optional.
4. **Car counts for any signal site** (1 to 2 days). Parse the HTML sheets directly (their detector tables name bike, tram, queue and pedestrian loops). Have Claude read the scanned PDF sheets into the `detector_approaches.json` format (a few cents each on Sonnet). Check every result against the counts: tram loops are flat at tram frequency, bike loops are low and peaky, car loops on one street roughly agree between junctions. Keep one growing table; Victoria has about 4,500 signal sites. Any sheet can be fetched on its own from DTP's zips with range requests.
5. **Run it as a service** (about 1 day). A small server for the `http` model: takes an ImpactRequest, runs SUMO, returns an ImpactResult. Cache the normal-traffic runs per area so each closure only needs the closure runs. Needs an always-on host such as Fly.io or Railway, a few dollars a month. New spend, so the team decides.

If shortlisted for Thursday: 6b steps 3 and 4 first. A second street (6c steps 1 and 2) only if they are done.

## 7. Real report (in progress)

- **done** Traffic numbers, ratings, method and assumptions come from the impact result.
- **later** Safety finding and recommended actions from the plan vs street comparison (step 5) instead of `barrier-brain.json`.
- **later** A real site map instead of the design board's aerial image.
- **later** Server-rendered PDF. Sharing and team access need user accounts.

## 8. Production basics (after the hackathon)

User accounts, error handling, tests on measurement and model code, AI cost limits (set a gateway budget), confirmed licences for RADAR and the sample TGS, testing on real iPhones.

## Log

- [30 Sep] Tim: plan written. Steps 1 and 2 partly done on branch `tim` (commit cdcb9f7). Claude runs on Sonnet 5.5 through Vercel AI Gateway with paid credit, since the free credit covers no Claude models.
- [30 Sep 3:45am] Tim: PDF TGS tested and works. SUMO installed and ran on the Swanston area as a spike. Agreed order for tonight in step 6a: swappable model shapes, SUMO, Tamara's model in TypeScript, demo consistency.
- [30 Sep 4:00am] Tim: step 6a parts 1, 3 and 4 done. The report now reads a swappable impact result. Default model is Tamara's lookup, ported to TypeScript and live. SUMO plug-in in progress.
- [30 Sep 4:15am] Tim: first SUMO run used 300 GB of memory and crashed the laptop (too much traffic, stuck cars kept in memory). Run script now has a 3 GB and 20 minute limit. Full and 30% demand still gridlocked from the Spring St / Victoria Pde junctions at the map's east edge, so the network is cut at Exhibition St and rebuilt.
- [30 Sep 4:25am] Tim: SUMO works at 50% of counted traffic after cutting the network at Exhibition St and simplifying junctions and signals. Plugged in as an early, precomputed result. Far fewer diversions than the lookup model, flagged for Tamara.
- [30 Sep 4:45am] Tim: a second session reviewed the SUMO work. Fixed without rerunning: diversions now a range (44 to 100), detour 7 m shortest vs 114 m driven, queue dropped as noise, access loss and demand split stated, image caption corrected.
- [30 Sep 4:55am] Tim: SUMO is now the default where it has a result (the Swanston sample); Tamara's model covers every other site. Her model now warns that it may overstate diversions on tram streets.
- [30 Sep 5:05am] Tim: the TGS prompt now lives in prompts/tgs-analysis.md so the team can refine it without touching code.
- [30 Sep 5:09am] Tim: handover docs. "Where things stand" added at the top of this file, README rewritten, pointers in CLAUDE.md, model/README.md, DESIGN.md.
- [30 Sep 7:00am] Tim: SUMO now fitted to car counts per approach from SCATS detectors and DTP signal sheets at 9 junctions (model/sumo/detector_approaches.json, 00_detector_counts.py). Whole-site totals overstated cars 1.3 to 3.5 times, which caused the old gridlock. Full traffic, 10 seeds: 21 to 97 shortcut drivers an hour, delay within noise. Lookup's 10,000 a day ruled out for Swanston. Caveat: the shortcut needs a right turn the signal plan doesn't show.
- [30 Sep 7:30am] Tim: SUMO roadmap written into step 6. Less janky (6b: turn rules, actuated signals, simulated-vs-count check) before any site (6c: closure from the TGS, per-site config, sheet reading, service).
- [30 Sep 10:30am] Tim: SUMO clip on the report page (optional `visual` in the impact result, `public/assets/sumo-swanston-5pm.gif`, 3.4 MB). Numbers unchanged.
- [30 Sep 10:45am] Tim: clip redone from the right-turn-allowed case with the cars that use the block pink on the left and purple on the right, with a short trail, closed block drawn only on the closure panel (3.5 MB). Numbers unchanged.
- [30 Sep 10am] Tim: `tim` merged into `main` (fast-forward, 30 commits, lint and build pass). Vercel production now serves the Swanston report from the saved SUMO result.
- [30 Sep 9am] Tim: SUMO less janky (6b items 3 and 4), done on branch `tim-sumo-refinement` and merged into `tim` at 9:55am. The network had been built for right-hand traffic and netconvert had dropped 20 OpenStreetMap turn restrictions; both fixed, with the sheet's right-turn ban as the main case. Delay-based signals. New calibration check of simulated traffic against the counts found three demand bugs (boundary sites, side-street-only sites, cars on tram-only Swanston St). Now 71% of counted street-hours within GEH 5, afternoon peak still too congested. Diversions about 123 (110 to 162) over the works hours, about 1,080 if the right turn is allowed. App numbers unchanged until the team reviews.
- [30 Sep 7:45am] Tim: SUMO covers every hour of the works (7am to 10pm, 320 runs). About 810 shortcut drivers over the works hours with the La Trobe St right turn allowed, about 77 with it banned; the report shows 77 to 871. Delay left out when it is noise, so the rating rests on diversions (Moderate).
- [30 Sep 11:30am] Joel: on branch `joel`, scan screens use the TGS scan points, real scans are measured in the browser, Claude writes the safety finding and actions from the measurements. Test TGS (Swanston St at the Sidney Myer Asia Centre) and synthetic scans in `data/test/`.
