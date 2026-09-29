# Build plan

How we get from the demo to a fully working Barrier Brain. BRIEF.md says what we are building and why. This file says what to build next and in what order.

Keep it current. When a step's state changes, update it here in the same commit. Add a dated line to the log at the bottom. Refine the steps as we learn more.

State: **done**, **in progress**, **next**, **later**.

## Where things stand (30 Sep, 7am)

Read this first when picking up the work. All of it is on branch `tim`, pushed, with lint and build passing. `main` does not have it yet (see step 1).

**Real**
- TGS analysis: Claude Sonnet 5.5 via Vercel AI Gateway reads an uploaded PDF, PNG or JPG (`app/api/analyse-tgs/route.ts`, prompt in `prompts/tgs-analysis.md`, output shape in `lib/tgs-analysis.ts`). About 20 s and 3.5 cents a run. "Use demo TGS" loads a saved result (`data/mock/tgs/swanston-analysis.json`) and says so.
- Impact estimate: `/api/impact` builds an ImpactRequest from the TGS analysis (nearest SCATS site by street name, `lib/impact/request.ts`) and runs the chosen model (`lib/impact/index.ts`). Default: the SUMO early result for the Swanston sample, Tamara's lookup model live for every other site. Contract in `model/IMPACT_CONTRACT.md`.
- Report: traffic numbers as ranges, one written severity rule for every model (`lib/impact/severity.ts`), "Review required" or "Not modelled" for modes no model covers, and a "How this was estimated" section with method, confidence and assumptions (`lib/data.ts` `buildReport`, `components/site-report.tsx`).
- All 9 of Raina's screens, laid out for a phone, including the PDF-style preview and Share.

**Still fixed demo data**
- Scan upload and check: the file is not read, "4 of 5" then "5 of 5 captured" are scripted (steps 3 and 4).
- Scan measurement and the plan vs street comparison (steps 4 and 5).
- The safety finding and the first two recommended actions, written for the Swanston sample (`data/mock/barrier-brain.json`). They show for any TGS.
- Projects list: three fixed entries, and every project shows the Swanston report.
- The aerial site image on the report is artwork from the design board.
- Pedestrians, trams, buses and trucks: no model covers them. Tram streets come from a hand-made list in `lib/impact/request.ts`.

**Known limits of what is real**
- SUMO (`model/sumo/README.md`): Swanston only, 8am to 9am only. Traffic is now fitted to measured car counts per approach at the 9 junctions around the closure, at full traffic. No counter measures the closed lane: the 21 to 97 drivers an hour are simulated shortcut drivers, and the shortcut needs a right turn from La Trobe St that may be banned. Delay and queue are within noise.
- Whole-site SCATS totals overstate cars by about 1.3 to 3.5 times (bikes, trams, queue loops, hook-turn boxes, duplicate detectors). Tamara's model and the app's `daily_volume` still use them.
- Tamara's model: its typical estimate does not beat "no change", it has no road closed group, and it assumes half the signal site's traffic uses the closed street, which overstates streets with little car access.
- Uploads over 4.5 MB fail on Vercel although the screen says 20 MB (step 1, Blob).

**Next, in order**
1. Team review and merge `tim` into `main` (step 1). Decisions needed are listed in STATUS.md under Tim, "Review before merging".
2. Answers from Tamara on the questions in step 6a, including the site-total finding.
3. Scan work: one real Scaniverse export measured offline (step 4).
4. Impact model follow-ups (step 6).

**Running and checking**
- `npm run dev` (needs `vercel env pull .env.local` for the Claude call). The Claude Browser config "barrier-brain" runs it on port 3001.
- Vercel previews of `tim` need a Vercel login.
- `IMPACT_MODEL=mvm`, `sumo` or `http` (with `IMPACT_MODEL_URL`) switches the model.
- `node_modules/.bin/jiti model/check_ts_port.ts` checks the TypeScript port against the Python.
- SUMO: always run through `model/sumo/04_run.py`, which kills SUMO above 3 GB or 20 minutes. A run without limits used 300 GB and crashed the laptop.

## 1. Foundations (done, merge pending)

- **done** Branch `tim` created from `raina`. It has Raina's prototype plus the work below. `main` is untouched.
- **done** Server route for Claude calls: `app/api/analyse-tgs/route.ts`, through Vercel AI Gateway.
- **next** Team reviews `tim`, then merge it into `main` with a pull request. Raina's branch changes shared docs (DESIGN.md "LOCKED", open questions removed, auto share dropped), so the team should agree to those first.
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

## 3. Scan upload and coverage check (later)

- Upload scans to Blob (step 1).
- Check each scan covers its scan point: phone location at upload within about 15 m (BRIEF.md). Later, check the expected feature is in the scan, such as a kerb.
- Replace the fixed "4 of 5 captured" result with the real one.

## 4. Scan measurement in Python (later, riskiest)

Plan in BRIEF.md "Scan measurement": Open3D, trimesh, laspy. Find ground, kerb and obstacles, slice every 0.5 m, output clear widths as JSON. Runs as a Vercel Python function or a small separate service.

- **first** Get one real Scaniverse export of a street and measure it offline. This proves the approach before any wiring.

## 5. Plan vs street comparison with Claude (later)

Claude reads the TGS analysis and the scan measurements, flags each conflict ("footpath 1.4 m clear, plan needs 1.8 m") and suggests fixes from RPM's equipment inventory. Code produces every number. Claude only explains and recommends.

## 6a. Swappable impact models (done, 30 Sep)

The app must not be locked into one traffic model. Tamara may try other approaches, and SUMO is being tested. Order agreed by Tim on 30 Sep, 3:45am:

1. **done** Impact input and output shapes (`lib/impact/types.ts`, written up in `model/IMPACT_CONTRACT.md`) and a switch, `IMPACT_MODEL`, that picks the model (`lib/impact/index.ts`). A model can be TypeScript in the app, a saved JSON result, or an outside service over HTTP. The report reads only the result, via `/api/impact`, and shows the method, confidence and assumptions.
2. **done, early result** Plug-in: SUMO simulation of the Swanston closure (`model/sumo/`, README there). Precomputed, selected with `IMPACT_MODEL=sumo`, labelled "Early result", low confidence. Since 30 Sep 6am it is fitted to measured car counts per approach (SCATS detectors plus DTP signal sheets) at the 9 junctions around the closure, and runs at full traffic without gridlock. 21 to 97 drivers an hour use the block as a shortcut from La Trobe St to A'Beckett St and must go another way; most drive up to about 300 m further; delay is within run-to-run noise (10 seeds). No queue is reported. Not yet credible: no counter on the closed lane, the shortcut needs a right turn that the signal plan doesn't show, congestion is still too high, only 8am to 9am, no trams, pedestrians or trucks. Slide image: `model/sumo/output/swanston-closure.png`.
3. **done** Plug-in: Tamara's model ported to TypeScript (`lib/impact/models/mvm-core.ts`), live, and used for every site without a SUMO result. Matches the Python example exactly (night 11.9, day 428.6, 24 hours 1,022.0 vehicle-hours; check with `node_modules/.bin/jiti model/check_ts_port.ts`). "Road closed" runs as 0 lanes open on the lookup's level 3 fallback, and the plan's own hours drive the queue. Tamara's Python files are unchanged.
4. **done** Demo consistency: Swanston naming, report text matching this TGS (tram corridor marked for review), the written severity rule (`lib/impact/severity.ts`), a saved demo analysis, and a tighter work hours prompt.

Questions for Tamara:
- The `mvm_predict.py` docstring calls the worst case P10, but the code uses P90 (least traffic avoided the site). The port follows the code, and adds P10 as the "low" end of each range. Which is intended?
- With the road fully closed, the queue model holds a 500 m queue for every hour of works, so delay mostly measures hours worked. The port ranks work windows by forced diversions in that case. Is that right?
- The lookup has no "road closed" group. Could one be built from RADAR?
- Answered from public data on 30 Sep (DTP detector counts and signal sheet for 2921): no detector counts the closed northbound lane, but only La Trobe St traffic can enter it, and La Trobe St carries 13,742 cars a day in both directions. So the lookup's 10,000 diversions a day is not possible here. The 46,939 site total counts every detector: bikes, trams, queue loops and a second set at the tram stop.
- The site totals in `headline_stats/output/02_scats_site_daily.csv` sum every detector. At the four junctions checked, cars are 29% to 78% of the total. Should the lookup's daily volume use car stop-line detectors only? The detector roles come from DTP's Traffic Signal Configuration Data Sheets (`model/sumo/detector_approaches.json` has nine CBD sites).

## 6. Impact model follow-ups (later)

The models are connected (step 6a). What would make the numbers stronger:

- **done** Detector-level counts for site 2921 (30 Sep). They rule out the lookup's figure for Swanston, but no detector counts the closed lane itself.
- **next** Check whether cars may turn right from westbound La Trobe St into Swanston St. SUMO's whole diversion result rests on it.
- **next** Replace the lookup model's 50% closed-street share and whole-site totals with per-approach car detector counts, so it stops overstating streets with little car access. Method and nine mapped sites in `model/sumo/detector_approaches.json`; any site's signal sheet can be fetched on its own from DTP's zips with range requests.
- Read signal sheets for more of the 52 SUMO counting sites, replacing the single 0.57 correction.
- A "road closed" group in the lookup, if RADAR has enough full closures.
- SUMO for any site: parametrise `model/sumo/` by street, extent and location from the TGS analysis. About 1 to 2 hours. Runs take 5 to 10 minutes and up to 2 GB, so it must run offline or on a separate server, not in a Vercel function. Each new area needs its network checked for artificial jams.
- SUMO credibility: real signal plans, per-approach counts, more hours than 8am to 9am, trams from PTV GTFS.
- Other modes: pedestrians (City of Melbourne Pedestrian Counting System; sensor 187 at 330 Swanston St, 21 m from the site, counts about 8,000 people a weekday), trams and buses (PTV GTFS), trucks.

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
