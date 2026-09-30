# Status

## Links
- App: https://taj-tea-m.vercel.app
- Repo: https://github.com/timothy-unimelb/taj-tea-m

## Joel
Now:
Done:
- [21:30] On branch `joel` (not merged): report reworked for the demo TGS so key takeaways stand out. Each check leads with a short coloured answer and one line; one-sentence summaries; Traffic covers delay hours, detour streets, capacity, queue, detour safety; Site safety is three actions tagged by point, incl. the open plant crossing. Figures unchanged. data/mock/reports/swanston-smac-report.json, components/site-report.tsx, app/globals.css.
- [20:45] Merged `joel` into main and checked on Vercel: multi-scan upload page, evidence after upload, additional scan without the trip back, undistorted site overview, recommendations tied to report points (max 5), Close on the report. Site check on Vercel with a real scan: finds the nearest council pedestrian sensor (Grattan St-Swanston St, 45 m) and applies the crowding rule (708 an hour needs 1.5 m clear for B+).
- [20:10] On branch `joel`: "Recommended before deployment" now matches the report's points (each names its point, most severe first, max 5, same in the PDF). Report's Back is now Close, back to Projects. Demo copy has a site safety recommendation.
- [19:45] On branch `joel` (not merged): scan page takes several scans, stitched by lib/scan/stitch.ts (Tamara's registration goes there; GPS join until then), no .zip, scan evidence only after upload, "Upload additional scan" opens the picker in place. Site overview artwork no longer stretched. Site check now gets the nearest City of Melbourne pedestrian sensor counts and the council's crowding rule (prompts/site-check.md, lib/pedestrians.ts). Claude site check with the counts not yet run on Vercel.
- [12:10] Test TGS redrawn in the sample's layout (Vicmap aerial) and moved to where the site scan was taken: southbound kerbside lane, east side, 22 to 60 m north of Grattan St. Site overview now shows the real TGS and a top-down render of the scan. Scan measurement finds the real kerb more reliably; the merged site scan's kerb reads 50 mm, so widths are still withheld. Full pipeline rerun against Vercel: works.
- [11:55] End-to-end test on Vercel with the test TGS (data/test) and the 4 real Scaniverse scans merged into one site scan: TGS read by Claude (17 s), site check by Claude (14 s), report generated. Kerb found (150 mm); footpath widths withheld as unreliable. Found: the lookup model keeps a lane open for a lane closure even when the direction has only one lane, so Traffic shows Low for this TGS.
- [11:48] Merged `joel` into main. One site scan covers every scan point. Scan screens use the TGS scan points. Real PLY/LAS scans are measured in the browser; kerb found on the real scans, footpath widths withheld as unreliable. Claude plan vs street check (/api/site-check) with a rule fallback.

## Tim
Now:
Done:
- [20:50] New project "Swanston Street Kerbside Works" (first in Recent projects) walks the demo flow with the test TGS and no Claude call: saved Claude read of the TGS, the demo site scan (measured in the browser), SUMO result, and report points written in advance in data/mock/reports/swanston-smac-report.json. Each point answers the questions in PITCH_CHECKLIST.md (delay, detour streets, queue, detour safety; pedestrian risk, extra walking, lunchtime crowding; trams and buses, stop access, PTV permit; three site safety actions). "Use demo TGS" now loads the test TGS; the old Swanston Street Work Zone project keeps the La Trobe St sample. New finding on the test TGS: VMS 1 and 2 stand south of Faraday St, past the detour turn. Tested locally end to end (only /api/impact called); lint and build pass. lib/data.ts, components/barrier-brain-prototype.tsx, components/site-report.tsx, data/mock/.
- [20:00] "Use demo site scan" now loads our real scan of Swanston St near Grattan St (public/scans/swanston-st-site-scan.las, 14.6 MB: three of the morning's four Scaniverse scans joined, every third point). It is measured and checked like an upload, so the report no longer shows the La Trobe St sample findings. Tested locally with the test TGS: 34.9 m scanned, kerb 170 mm, footpath width not measured, Claude's site check ran with the council pedestrian counts. If the file can't be fetched the old stand-in is used. "Use demo TGS" is still the La Trobe St sample. components/barrier-brain-prototype.tsx, data/mock/barrier-brain.json, data/test/make-demo-scan.ts. Pushed with the SUMO wiring below.
- [19:50] The test TGS now shows the SUMO result in the report, with no setting needed: cars Moderate, about 890 drivers diverted, cars an hour on each detour street, queue, delay, and the route map. Every other TGS still runs the lookup. SUMO's two plan gaps show as findings: under Traffic and Public transport as "Plan gap", and as recommendations 1 and 3 (close Faraday St westbound at Cardigan St; agree a detour for bus 546). Tested locally end to end with a real Claude read of the test TGS; lint and build pass. lib/impact/ (types, precomputed, index), lib/data.ts, data/impact/sumo-smac.json, model/sumo/10_site_report.py, model/IMPACT_CONTRACT.md.
- [19:25] SUMO now runs the demo site: the test TGS, Swanston St southbound closed from Faraday St to Grattan St, 9:30am to 3:30pm. Run with `SUMO_SITE=smac` in model/sumo/; results in model/sumo/output/smac/ (impact.json for the app, facts.json for Claude to write report points from, two route maps). On main (6b4b7d6). Not wired into the app yet. 891 drivers must divert (the lane's own SCATS counter says 888). On the signed detour Faraday St goes from 41 to 160 cars an hour, Cardigan St 187 to 310, Grattan St 301 to 429, the fullest at 65% of a lane's capacity. About 22 s extra per diverted trip; longest queue 38 m (71 m worst) on Cardigan St. Also found: Faraday St westbound becomes a dead end (it can only turn into the closed lane), and bus 546 drives the closed lane. The test TGS covers neither. Details in model/sumo/README.md "Second site".
- [16:34] A TGS that closes a whole direction is now modelled with no lanes open: Claude reports `direction_closed` (lib/tgs-analysis.ts, prompts/tgs-analysis.md), and the lookup model uses it. The test TGS now shows about 1,500 diversions (1,200 to 1,900), cars High, night works recommended. Also fixed the "No traffic signal site matched" note showing on non-tram streets that did match.
- [16:32] Default impact model is `mvm` again (lib/impact/index.ts), live on Vercel. The TypeScript port matches Tamara's Python on 9 test cases. Test TGS on Vercel: runs `mvm` live in 0.8 s. Cars show Low (0 delay) because Claude reads 0 lanes, so the model assumes 2 each way with 1 open, but the plan closes the whole southbound side. With 0 lanes open it would be about 1,500 to 1,900 diversions.
- [10:30] SUMO clip on the Swanston report under "How this was estimated": five simulated minutes at 5pm, normal street beside the closure, with a legend. Optional `visual` field in the impact result (model/IMPACT_CONTRACT.md). Report numbers unchanged.
- [10:45] Clip redone so the difference shows: cars that use the block are purple with a trail, the closed block is drawn only on the closure panel, and the clip is from the right-turn-allowed case (the main case moves a car or two a minute and the panels looked identical). Caption says which case it is. Numbers unchanged.
- [11:35] Checked the La Trobe St westbound right turn on Google Street View (Nov 2025): No Right Turn sign on the approach, so the model's main case is the real street. Turn rule now high confidence; photo in model/sumo/output. The report's high figure (right turn allowed) is now a what-if rather than a possible reading of the street, which the team should decide how to present.
- [10:00] `tim` merged into `main` (fast-forward, lint and build pass). The review list below is now a list of things the team can still revisit.
- [09:05] SUMO less janky, merged into `tim` at 09:55 (app numbers unchanged). Left-hand traffic (was right-hand), every turn at the closed block sourced (OpenStreetMap plus sheets, `model/sumo/turn_rules.json`), delay-based signals, and `08_check_counts.py` checking simulated traffic against the counts: 71% of counted street-hours within GEH 5, afternoon peak still drops 5% to 7% of cars. Diversions about 123 (110 to 162) over the works hours with the La Trobe St right turn banned, about 1,080 if allowed. Details in model/sumo/README.md "Turn rules" and "Calibration check".
- [07:45] SUMO: every hour of the works (7am to 10pm), and the La Trobe St right turn banned as a second case. Report now says about 755 to 871 shortcut drivers over the works hours, about 77 if the turn is banned. Delay left out as noise. model/sumo/, data/impact/sumo-swanston.json.
- [07:00] SUMO fitted to measured car counts per approach (SCATS detectors + DTP signal sheets, 9 junctions). Full traffic, no gridlock, 10 seeds: 21 to 97 shortcut drivers an hour, delay within noise. Whole-site totals overstate cars 1.3 to 3.5x; flagged for Tamara. model/sumo/, data/impact/sumo-swanston.json.
- [05:15] Handover notes: what is real, what is still demo data, known limits and next steps. README rewritten.
- [05:05] TGS prompt moved to prompts/tgs-analysis.md so the team can refine it without editing code.
- [04:55] SUMO is the default impact model where it has a result (the Swanston sample). Tamara's lookup runs live for every other site.
- [04:45] SUMO work reviewed by a second session and corrected: diversions 44 to 100 an hour, detour about one block, no queue (noise).
- [04:25] SUMO plug-in for Swanston, model/sumo/. Early result, low confidence, precomputed. The first run crashed the laptop (300 GB); runs are now capped at 3 GB and 20 minutes.
- [04:00] Swappable impact models: contract (lib/impact/types.ts, model/IMPACT_CONTRACT.md), IMPACT_MODEL switch, written severity rule, Tamara's model ported to TypeScript, report shows method and assumptions. Swanston naming and copy, saved demo TGS analysis, tighter work hours prompt.
- [29 Sep] Real TGS analysis: Claude Sonnet 5.5 via Vercel AI Gateway. About 20 s and 3.5 cents per run.

Merged into `main` 30 Sep 10am. Still worth a team look:
- The 9am SUMO refinement is in `tim` (model/sumo/ and its committed outputs only). `data/impact/sumo-swanston.json`, what the app shows, is untouched: switching it to the new result would move the car rating from Moderate to High because the high end is the right-turn-allowed sensitivity case. Decide that before copying the file.
- Raina's doc changes that came with her branch: DESIGN.md is now "LOCKED" (it was "NOT SET"), the flow was replaced with her 9 screens, open questions were deleted from BRIEF.md, and "share sheet opens on return home" became an explicit Share button. Agree these as a team.
- Swanston changes: the project is now "Swanston Street Work Zone". Report copy, the safety finding and two recommended actions were rewritten for this TGS. The safety finding and actions are still fixed demo copy, because scan measurement isn't connected. Trams and pedestrians show "Review required", not a rating, because no model covers them yet.
- SUMO numbers changed at 7:45am (measured car counts, full traffic, whole works period). The Swanston report now says about 755 to 871 drivers over 7am to 10pm, or about 77 if cars can't turn right from La Trobe St into Swanston St (the signal plan shows no car right-turn signal).
- Default impact model: `sumo` where a SUMO result exists (only the Swanston sample), `mvm` (Tamara's lookup, live) everywhere else. Tim chose this at 5am because the lookup assumes half of the intersection's traffic uses the closed Swanston block, which is mostly tram only (about 10,100 diversions a day vs SUMO's tens to a hundred an hour). Set `IMPACT_MODEL=mvm` on Vercel to go back. The video should say the Swanston numbers are an early SUMO result.
- Severity limits in lib/impact/severity.ts are a first cut by us. Check them with RPM Hire mentors and Tamara.
- For Tamara: the P10/P90 docstring question, ranking windows by diversions when the road is closed, whether a "road closed" group can be added, and the detector counts for site 2921.
- Known gap: every project, including "Elizabeth Street Closure", shows the Swanston result, because there is only one demo analysis.
- Upload limit copy still says 20 MB but Vercel accepts 4.5 MB until Blob storage is in.

## Advait
Now:
- [23:30] Scan registration automatic in the app. Several uploaded LAS scans are fitted to each other and placed on the map by code (lib/scan/site-scan.ts, wired into lib/scan/stitch.ts). Synthetic test passes end to end (5 cm between scans, 0.5 m on the map). Real Swanston St scans: the two overlapping pairs fit as Tamara found; the join between the pairs and the map placement are withheld with a note (see scans/swanston_registered_v2/SCAN_REGISTRATION_STATUS.md, top). Checked in the desktop browser: two real scans uploaded on the scan screen fit to within 4 cm and reached Site scan complete in 58 s. Not yet timed on a phone; all four scans take about 90 s in Node on a laptop.
- Preparing the Thursday 1 Oct pitch. The live demo change list is PITCH_CHECKLIST.md (Tim and Joel building).
Done:
- [12:30] Pre-screening PDF submitted and filed at artifacts/submission/pre-screening.pdf. BRIEF.md (Demo plan, Decisions) points to it. PITCH_CHECKLIST.md lists the changes to make before the pitch, including the PDF's three "what's left" items.
- [12:05] Scan upload screen now says "photogrammetry scanning app", not LiDAR. components/barrier-brain-prototype.tsx. CSS class and asset key names left as they are. Build passes.
- [22:15] Wrote up Barrier Brain. BRIEF.md (brief, scan measurement approach, demo plan), DESIGN.md flow, CLAUDE.md, sample TGS in data/mock/tgs/.
- [22:30] Added a decisions log to BRIEF.md and a rule in CLAUDE.md so every session keeps BRIEF.md up to date.

## Tamara
Now:
Done:
- [19:00] Committed the Swanston St scan registration work: scans/swanston_registered_v2/ (status doc, transforms, registration code) and tools/scan_register/ (satellite alignment tool). Scan files (25 MB) stay local. THIRD_PARTY.md updated.
- [11:55] Added model/mvm/SOURCES.md: the 69 URLs for the data the model uses (RADAR pages, SCATS zips, Traffic Lights, AADT files).
- [11:20] Committed the flat parquet (7.4 MB) at model/data/closure_site_hour.parquet. build_mvm.py reads it by default, so the model builds without the raw files; build_parquet.py writes there.
- [11:00] Model no longer needs the local warehouse. Added model/headline_stats/build_headline_stats.py (same outputs, rebuilt from raw SCATS). Removed warehouse-only scripts and SQL. model/README.md links the raw files on Google Drive.
- [10:20] Model now builds from the parquet: model/mvm/build_mvm.py (15 s). Same outputs as the warehouse build (differences 1e-16). CSVs regenerated; app tables not re-exported since values are unchanged.
- [09:30] Added model/build_parquet.py. Joins the raw closure, SCATS, site, AADT and holiday files into one parquet (closure x site x day x hour, 4.8M rows, 7 MB). Output is local only, in parquet/ of the data folder. Counts match the warehouse exactly.
- [23:15] Added the closure-impact model in model/: code, notes and output CSVs (not the 5 GB warehouse). `python model/mvm/mvm_predict.py` runs it. Not connected to the app yet. THIRD_PARTY.md and BRIEF.md updated.

## Others
Now:
Done:
- [23:16] Codex: completed the locked mobile frontend and report/PDF preview. app/, components/, lib/data.ts, data/mock/, public/assets/. Build and lint pass; browser flow and responsive checks complete. Evidence in design-qa.md and artifacts/qa/. Local production preview on port 3000. Analysis remains mocked.

## Assumptions
[Anything a session guessed at because it wasn't specified. One line each, with the person's name.]
- Tamara: the Google Drive folder of raw files keeps the local layout raw/<dataset>/<date>/<file>, so --root works on a download of it.
- Advait: scan check passes if the phone is within about 15 m of the scan point at upload.
- Advait: sample TGS licence (Invarion) not confirmed. Check before submission.

<!-- Line format for Now and Done: `[14:05] What's happening. Which files. Notes.` Start a line with `BLOCKED:` if stuck, and say on what. -->
