# Build plan

How we get from the demo to a fully working Barrier Brain. BRIEF.md says what we are building and why. This file says what to build next and in what order.

Keep it current. When a step's state changes, update it here in the same commit. Add a dated line to the log at the bottom. Refine the steps as we learn more.

State: **done**, **in progress**, **next**, **later**.

## 1. Foundations (in progress)

- **done** Branch `tim` created from `raina`. It has Raina's prototype plus the work below. `main` is untouched.
- **done** Server route for Claude calls: `app/api/analyse-tgs/route.ts`, through Vercel AI Gateway.
- **next** Team reviews `tim`, then merge it into `main` with a pull request. Raina's branch changes shared docs (DESIGN.md "LOCKED", open questions removed, auto share dropped), so the team should agree to those first.
- **next** Check the Vercel preview deployment of `tim` runs the TGS analysis (OIDC login on Vercel, untested).
- **later** File storage with Vercel Blob. The browser uploads straight to Blob and sends the route a link. Needed for files over 4.5 MB, which Vercel Functions reject, and for LiDAR scans. Chosen over Supabase Storage for now: same Vercel project, less setup. Revisit if we adopt Supabase for projects.
- **later** One sample site throughout. The TGS is Swanston St, but the project and report still say "Swan Street Work Zone" (`data/mock/barrier-brain.json`).

## 2. TGS analysis with Claude (done, with follow-ups)

- **done** Claude Sonnet 5.5 reads the uploaded TGS and returns JSON: site, closure type, hours, lanes, detour, equipment, pedestrian measures, 4 to 8 scan points, unclear items. Schema in `lib/tgs-analysis.ts`. Shown on the TGS complete and scan upload screens. About 20 s and 3.5 cents per run.
- **next** Test a PDF TGS. Only the WebP sample has been tested.
- **later** Optional: save one good result for the demo TGS so rehearsals are free and instant. Real uploads still go to Claude.
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

## 6. Impact model connected (later)

Run `model/mvm/mvm_predict.py` as a service. Inputs from step 2 (closure type, hours, lanes) and traffic data (daily traffic, nearest signal site). Fix first:

- The worst-case docstring says P10 but the code uses P90. Check with Tamara.
- Road size comes from the nearest signal site, not the daily traffic given.
- Show results as ranges and risk, not single numbers like "620 m".

Then add the other modes: pedestrians (City of Melbourne Pedestrian Counting System), trams and buses (PTV GTFS), trucks.

## 7. Real report (later)

Build the report from real outputs instead of `barrier-brain.json`. Server-rendered PDF. Sharing and team access need user accounts.

## 8. Production basics (after the hackathon)

User accounts, error handling, tests on measurement and model code, AI cost limits (set a gateway budget), confirmed licences for RADAR and the sample TGS, testing on real iPhones.

## Log

- [30 Sep] Tim: plan written. Steps 1 and 2 partly done on branch `tim` (commit cdcb9f7). Claude runs on Sonnet 5.5 through Vercel AI Gateway with paid credit, since the free credit covers no Claude models.
