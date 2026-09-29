# Status

## Links
- App: https://taj-tea-m.vercel.app
- Repo: https://github.com/timothy-unimelb/taj-tea-m

## Joel
Now:
Done:

## Tim
Now:
- [04:25] Final checks and summary for the team.
Done:
- [04:25] SUMO plug-in for Swanston, model/sumo/ (README there). Early result, low confidence, precomputed, `IMPACT_MODEL=sumo`. About 44 drivers an hour must avoid the block, about 227 m detour, delay within noise. Runs at 50% of counted traffic because the simulated network jams above that. Slide image in model/sumo/output/swanston-closure.png. The first run crashed the laptop (300 GB); runs are now capped at 3 GB and 20 minutes.
- [04:00] Swappable impact models: contract (lib/impact/types.ts, model/IMPACT_CONTRACT.md), IMPACT_MODEL switch, written severity rule, Tamara's model ported to TypeScript and live as the default, report reads only the impact result and shows method and assumptions. Swanston naming and copy, saved demo TGS analysis, tighter work hours prompt. Commit bc59d87. Vercel preview built.
- [branch tim] Real TGS analysis: Claude Sonnet 5.5 via Vercel AI Gateway reads the uploaded TGS and returns plan elements and scan points. About 20 s and 3.5 cents per run.

Review before merging `tim` into `main`:
- Raina's doc changes that came with her branch: DESIGN.md is now "LOCKED" (it was "NOT SET"), the flow was replaced with her 9 screens, open questions were deleted from BRIEF.md, and "share sheet opens on return home" became an explicit Share button. Agree these as a team.
- Swanston changes: the project is now "Swanston Street Work Zone". Report copy, the safety finding and two recommended actions were rewritten for this TGS. The safety finding and actions are still fixed demo copy, because scan measurement isn't connected. Trams and pedestrians show "Review required", not a rating, because no model covers them yet.
- Default impact model: `mvm` (Tamara's lookup, run live in TypeScript). Nothing needs setting on Vercel. `IMPACT_MODEL=sumo` switches to the SUMO early result, which only covers the Swanston sample; other sites fall back to `mvm`.
- The two models disagree a lot for Swanston: lookup about 10,100 diversions over the day, SUMO about 44 an hour at peak. The lookup assumes half of the intersection's traffic uses the closed block, which is mostly tram only. Decide which to show in the video, and say which it is.
- Severity limits in lib/impact/severity.ts are a first cut by us. Check them with RPM Hire mentors and Tamara.
- For Tamara: the P10/P90 docstring question, ranking windows by diversions when the road is closed, and whether a "road closed" group can be added. All in PLAN.md step 6a.
- Known gap: every project, including "Elizabeth Street Closure", shows the Swanston result, because there is only one demo analysis.
- Upload limit copy still says 20 MB but Vercel accepts 4.5 MB until Blob storage is in.

## Advait
Now:
Done:
- [22:15] Wrote up Barrier Brain. BRIEF.md (brief, scan measurement approach, demo plan), DESIGN.md flow, CLAUDE.md, sample TGS in data/mock/tgs/.
- [22:30] Added a decisions log to BRIEF.md and a rule in CLAUDE.md so every session keeps BRIEF.md up to date.

## Tamara
Now:
Done:
- [23:15] Added the closure-impact model in model/: code, notes and output CSVs (not the 5 GB warehouse). `python model/mvm/mvm_predict.py` runs it. Not connected to the app yet. THIRD_PARTY.md and BRIEF.md updated.

## Others
Now:
Done:
- [23:16] Codex: completed the locked mobile frontend and report/PDF preview. app/, components/, lib/data.ts, data/mock/, public/assets/. Build and lint pass; browser flow and responsive checks complete. Evidence in design-qa.md and artifacts/qa/. Local production preview on port 3000. Analysis remains mocked.

## Assumptions
[Anything a session guessed at because it wasn't specified. One line each, with the person's name.]
- Advait: scan check passes if the phone is within about 15 m of the scan point at upload.
- Advait: sample TGS licence (Invarion) not confirmed. Check before submission.

<!-- Line format for Now and Done: `[14:05] What's happening. Which files. Notes.` Start a line with `BLOCKED:` if stuck, and say on what. -->
