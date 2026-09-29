# Status

## Links
- App: https://taj-tea-m.vercel.app
- Repo: https://github.com/timothy-unimelb/taj-tea-m

## Joel
Now:
Done:

## Tim
Now:
- [branch tim] Real TGS analysis: Claude (via Vercel AI Gateway) reads the uploaded TGS and returns plan elements and scan points. app/api/analyse-tgs/, lib/, components/. Branch tim is based on raina. Code done, build and lint pass. Working locally on Claude Sonnet 5.5 with paid gateway credit: the sample TGS takes about 20 s.
Done:

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
