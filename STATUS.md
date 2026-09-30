# Status

## Links
- App: https://taj-tea-m.vercel.app
- Repo: https://github.com/timothy-unimelb/taj-tea-m

## Joel
Now:
Done:
- [12:10] Test TGS redrawn in the sample's layout (Vicmap aerial) and moved to where the site scan was taken: southbound kerbside lane, east side, 22 to 60 m north of Grattan St. Site overview now shows the real TGS and a top-down render of the scan. Scan measurement finds the real kerb more reliably; the merged site scan's kerb reads 50 mm, so widths are still withheld. Full pipeline rerun against Vercel: works.
- [11:55] End-to-end test on Vercel with the test TGS (data/test) and the 4 real Scaniverse scans merged into one site scan: TGS read by Claude (17 s), site check by Claude (14 s), report generated. Kerb found (150 mm); footpath widths withheld as unreliable. Found: the lookup model keeps a lane open for a lane closure even when the direction has only one lane, so Traffic shows Low for this TGS.
- [11:48] Merged `joel` into main. One site scan covers every scan point. Scan screens use the TGS scan points. Real PLY/LAS scans are measured in the browser; kerb found on the real scans, footpath widths withheld as unreliable. Claude plan vs street check (/api/site-check) with a rule fallback.

## Tim
Now:
- [16:28] Default impact model back to `mvm` (the live lookup) on main, then testing it on Vercel with the test TGS (data/test).
Done:
- [10:30] SUMO clip on the Swanston report under "How this was estimated": five simulated minutes at 5pm, normal street beside the closure, with a legend. Optional `visual` field in the impact result (model/IMPACT_CONTRACT.md). Report numbers unchanged.
- [10:45] Clip redone so the difference shows: cars that use the block are purple with a trail, the closed block is drawn only on the closure panel, and the clip is from the right-turn-allowed case (the main case moves a car or two a minute and the panels looked identical). Caption says which case it is. Numbers unchanged.
- [11:35] Checked the La Trobe St westbound right turn on Google Street View (Nov 2025): No Right Turn sign on the approach, so the model's main case is the real street. Turn rule now high confidence; photo in model/sumo/output. The report's high figure (right turn allowed) is now a what-if rather than a possible reading of the street, which the team should decide how to present.
- [10:00] `tim` merged into `main` (fast-forward, lint and build pass). The review list below is now a list of things the team can still revisit.
- [09:05] SUMO less janky, PLAN.md 6b items 3 and 4, merged into `tim` at 09:55 (app numbers unchanged). Left-hand traffic (was right-hand), every turn at the closed block sourced (OpenStreetMap plus sheets, `model/sumo/turn_rules.json`), delay-based signals, and `08_check_counts.py` checking simulated traffic against the counts: 71% of counted street-hours within GEH 5, afternoon peak still drops 5% to 7% of cars. Diversions about 123 (110 to 162) over the works hours with the La Trobe St right turn banned, about 1,080 if allowed. Details in model/sumo/README.md "Turn rules" and "Calibration check".
- [07:45] SUMO: every hour of the works (7am to 10pm), and the La Trobe St right turn banned as a second case. Report now says about 755 to 871 shortcut drivers over the works hours, about 77 if the turn is banned. Delay left out as noise. model/sumo/, data/impact/sumo-swanston.json. SUMO roadmap in PLAN.md step 6.
- [07:00] SUMO fitted to measured car counts per approach (SCATS detectors + DTP signal sheets, 9 junctions). Full traffic, no gridlock, 10 seeds: 21 to 97 shortcut drivers an hour, delay within noise. Whole-site totals overstate cars 1.3 to 3.5x; flagged for Tamara in PLAN.md step 6a. model/sumo/, data/impact/sumo-swanston.json.
- [05:15] Handover: PLAN.md "Where things stand" lists what is real, what is still demo data, known limits and next steps. README rewritten.
- [05:05] TGS prompt moved to prompts/tgs-analysis.md so the team can refine it without editing code.
- [04:55] SUMO is the default impact model where it has a result (the Swanston sample). Tamara's lookup runs live for every other site.
- [04:45] SUMO work reviewed by a second session and corrected: diversions 44 to 100 an hour, detour about one block, no queue (noise).
- [04:25] SUMO plug-in for Swanston, model/sumo/. Early result, low confidence, precomputed. The first run crashed the laptop (300 GB); runs are now capped at 3 GB and 20 minutes.
- [04:00] Swappable impact models: contract (lib/impact/types.ts, model/IMPACT_CONTRACT.md), IMPACT_MODEL switch, written severity rule, Tamara's model ported to TypeScript, report shows method and assumptions. Swanston naming and copy, saved demo TGS analysis, tighter work hours prompt.
- [29 Sep] Real TGS analysis: Claude Sonnet 5.5 via Vercel AI Gateway. About 20 s and 3.5 cents per run.

Merged into `main` 30 Sep 10am. Still worth a team look:
- The 9am SUMO refinement is in `tim` (model/sumo/ and its committed outputs only). `data/impact/sumo-swanston.json`, what the app shows, is untouched: switching it to the new result would move the car rating from Moderate to High because the high end is the right-turn-allowed sensitivity case. Decide that before copying the file (PLAN.md step 6b).
- Raina's doc changes that came with her branch: DESIGN.md is now "LOCKED" (it was "NOT SET"), the flow was replaced with her 9 screens, open questions were deleted from BRIEF.md, and "share sheet opens on return home" became an explicit Share button. Agree these as a team.
- Swanston changes: the project is now "Swanston Street Work Zone". Report copy, the safety finding and two recommended actions were rewritten for this TGS. The safety finding and actions are still fixed demo copy, because scan measurement isn't connected. Trams and pedestrians show "Review required", not a rating, because no model covers them yet.
- SUMO numbers changed at 7:45am (measured car counts, full traffic, whole works period). The Swanston report now says about 755 to 871 drivers over 7am to 10pm, or about 77 if cars can't turn right from La Trobe St into Swanston St (the signal plan shows no car right-turn signal).
- Default impact model: `sumo` where a SUMO result exists (only the Swanston sample), `mvm` (Tamara's lookup, live) everywhere else. Tim chose this at 5am because the lookup assumes half of the intersection's traffic uses the closed Swanston block, which is mostly tram only (about 10,100 diversions a day vs SUMO's tens to a hundred an hour). Set `IMPACT_MODEL=mvm` on Vercel to go back. The video should say the Swanston numbers are an early SUMO result.
- Severity limits in lib/impact/severity.ts are a first cut by us. Check them with RPM Hire mentors and Tamara.
- For Tamara: the P10/P90 docstring question, ranking windows by diversions when the road is closed, whether a "road closed" group can be added, and the detector counts for site 2921. All in PLAN.md step 6a.
- Known gap: every project, including "Elizabeth Street Closure", shows the Swanston result, because there is only one demo analysis.
- Upload limit copy still says 20 MB but Vercel accepts 4.5 MB until Blob storage is in.

## Advait
Now:
Done:
- [12:05] Scan upload screen now says "photogrammetry scanning app", not LiDAR. components/barrier-brain-prototype.tsx. CSS class and asset key names left as they are. Build passes.
- [22:15] Wrote up Barrier Brain. BRIEF.md (brief, scan measurement approach, demo plan), DESIGN.md flow, CLAUDE.md, sample TGS in data/mock/tgs/.
- [22:30] Added a decisions log to BRIEF.md and a rule in CLAUDE.md so every session keeps BRIEF.md up to date.

## Tamara
Now:
Done:
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
