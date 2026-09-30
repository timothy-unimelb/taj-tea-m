# Barrier Brain: product brief

This is the working brief. It will change. When the idea changes, update this file and the two lines in CLAUDE.md.

## The problem we answer

RPM Hire problem statement, UniMelb FEIT Hackathon 2026:

> Councils and contractors currently plan road closures and work zones with limited ability to foresee their knock-on effects on surrounding traffic, pedestrians, and public transport. Create a digital tool that simulates the impact of a planned road closure or work zone, using typical traffic equipment inventory (barriers, signage, VMS boards), before it is deployed on site.

RPM Hire hires out traffic equipment. Their mentors care most about efficiency gains and whether the tool scales.

Keep the problem statement and our own plan in equal weight. If a feature drifts away from "simulate the impact before deployment", say so.

## Who it's for

Someone at a road or traffic management company. Either the planner who drew the TGS, or the person whose job is to set up or verify it. We will refine this later.

## What Barrier Brain does

Barrier Brain is a mobile web app for traffic management planners. It checks a planned work zone against the real street. Then it reports the knock-on effects before any equipment is set up.

1. The planner uploads a traffic guidance scheme (TGS).
2. An AI agent reads the TGS. It lists the places on site that need scanning.
3. The planner scans those places with a phone camera. Photogrammetry turns the photos into a 3D model. They upload the scans.
4. An AI agent compares the scans with the plan. It finds where the street differs from the drawing.
5. The app estimates the effects on pedestrians, buses and trams, cars and trucks.
6. The app produces an impact report for the team to act on.

## Why it matters

Plans are drawn over aerial photos. They assume widths the street may not have. Café seating, bins, poles and signs narrow footpaths and lanes.

Today these problems show up after setup. Fixing them then costs a crew and a truck trip.

NSW rules tell crews to watch pedestrian behaviour in the first week and then amend the plan. Barrier Brain moves that check to before deployment.

## Why mobile

Preparation and scanning can happen anywhere. We design for a phone so the whole flow can happen on site. That keeps the scan as recent as possible.

It is a Next.js app on Vercel, laid out for a phone. It is not a native app.

## System flow

From the team flowchart. Three layers.

- **Data layer.** The planner uploads the TGS. A traffic API provides base reference data.
- **App.** Analyse TGS, then identify points of interest to scan, then photogrammetry site scan, then analyse site scan, then simulate traffic flow, then generate report and metrics. The base reference data feeds into both the simulation and the report. (The flowchart only shows the report. The simulation needs it too.)
- **Organisational process.** The report goes to the team.

## Screens

From the whiteboard sketch. The sketch splits the flow into two phases: preparation, then on-site scan. See DESIGN.md for the screen list.

## Components

- **Analyse TGS (agent).** Reads the layout, the equipment, the pedestrian routes and the widths the plan assumes. Works out the drawing's scale by matching features to map data with coordinates. Use City of Melbourne open data or Vicmap. Google Maps terms ban extracting data from its imagery.
- **Identify scan points (agent).** Picks every place where the plan assumes there is enough space. Both edges of the zone, both ends, where pedestrians are sent, each sign and equipment position, and where work vehicles park.
- **Scan.** Photogrammetry: a 3D model built from phone photos of the site, exported as PLY, LAS or OBJ. Works on any phone, not just LiDAR iPhones. The app reads PLY and LAS. A later version may use our own scanner that keeps data when the phone moves.
- **Scan check.** One site scan covers every scan point. It fails if it has too few points, covers less than 2 m of street, or shows no kerb. Later, also check the phone's location at upload is within about 15 m of the scan point.
- **Analyse scans.** Two parts. Code measures the scan, in the browser (PLY or LAS), so large files never go to the server. The agent reads the measurements next to the TGS analysis. If the agent can't be reached, plain rules on the measurements give the findings. See "Scan measurement" below.
- **Impact model.** Built, in `model/`. It is not machine learning. It is a lookup table learned from about 2,700 past Melbourne closures (RADAR, 2024 to 2026) matched to SCATS signal counts within 200 m, plus an hour-by-hour queue calculation. Inputs: closure type, work hours, daily traffic, lanes open. Outputs: likely traffic change as a range, chance of a big drop, delay, queue length, forced diversions and the best work window. It runs in Python from CSVs in the repo, and a TypeScript port runs live in the app. See `model/README.md`.
- **Swappable impact models.** The app is not tied to one model. Every model takes the same input and returns the same result: ranges per mode (cars, pedestrians, trams and buses, trucks), the method used, assumptions and confidence. One setting picks the model. A model can run in the app, be a saved result, or be an outside service. Modes a model doesn't cover are shown as not modelled. The same written rule rates severity for every model. See `model/IMPACT_CONTRACT.md`.
- **Base reference data.** Traffic, pedestrian and public transport data from APIs. Where it feeds in is not decided.
- **Report.** Visual in-app impact report with category tabs and expandable recommendations. Export PDF opens a document preview, with browser print/save PDF for the prototype. Sharing is an explicit action using Web Share or a copy-link fallback.
- **Storage.** Past projects live in the browser's localStorage for the demo. Supabase may come later.

## Scan measurement

A language model cannot read a 3D mesh directly. Plain geometry code turns the scan into numbers first. The agent then reads those numbers next to the TGS analysis.

Steps, in Python with open-source libraries (Open3D, trimesh, laspy):

1. Load the PLY, OBJ or LAS file as a point cloud.
2. Find the ground. Fit a plane to the lowest large flat surface (RANSAC plane fit in Open3D).
3. Find the kerb. It is a height step of about 100 to 150 mm in the ground. That splits footpath from road and gives the street's direction.
4. Find obstacles. Anything standing more than about 5 cm above the ground, up to about 2.2 m, blocks the path. Poles, bins, café seating, signs.
5. Slice the scan across the street every 0.5 m. In each slice, measure the widest continuous free span on the footpath and the width of each lane.
6. Output JSON: clear width per slice, the narrowest point, and each obstacle with its position and size.

The agent compares that JSON with the widths the TGS assumes at that scan point. It flags each conflict, for example "footpath at scan point 3 is 1.4 m clear, plan needs 1.8 m".

This runs as a Python function (Vercel supports Python functions, or a small separate service). For the Wednesday video it is mocked. If time allows, run it offline on one real scan so at least one number is real.

## Report

The frontend layout is locked by the final Barrier Brain UI board supplied on 29 Sep. See DESIGN.md for the complete flow.

- Header: project, date, the period the impact numbers cover, overall impact from the severity rule.
- Overview, Traffic, Pedestrians, Public transport and Safety tabs.
- Amber review-required decision, impact summary, aerial site overview and two expandable recommended actions.
- Document-style PDF preview, explicit Share action, and planning disclaimer.
- Traffic numbers, ratings and the method note come from the impact model's result. The safety finding and two recommended actions are still fixed demo copy for the Swanston sample, because scan measurement is not connected.

The earlier before/after modelling definition remains background for future model integration. The locked frontend uses the supplied impact summary and recommendations, without adding before/after tables.

Figures on the sketches, such as "96%", are placeholders.

## Sample TGS

`data/mock/tgs/swanston-st-closure.webp`. A real-style TGS from Invarion (the RapidPlan maker). Use it as the mock upload and to shape mock data.

- Swanston Street closed between La Trobe Street and Little La Trobe Street, beside Melbourne Central and the State Library.
- Detour via Elizabeth Street and Little La Trobe Street. Little La Trobe stays open to light vehicles for local access.
- 4 VMS boards, 2 panels each, such as "Swanston St closed / Access via E'beth and Lit La Trobe".
- Water-filled barriers along the work area. Footpath closed signs send pedestrians to the other side.
- Southbound pedestrians walk on the road while traffic controllers hold traffic. A roaming traffic controller guides traffic and pedestrians.
- Hook turn slot to be covered, bollards placed. Bicycle lane closed, cyclists dismount.
- The inset map gives hours: Monday, 7am to 10pm. The title block (scale, date, street, council) is blank. Dimension lines mark 30 m and 40 m, so scale can be recovered.

## Demo plan

- **Wednesday 30 Sep, 12:30pm:** 3 slides plus a video demo. The bare minimum flow, mocked where needed.
- **Thursday 1 Oct:** only if shortlisted. Not planned yet.

Real for Wednesday: Claude reads the uploaded TGS and lists the scan points.

Real for Wednesday: impact estimates. The Swanston sample shows a SUMO simulation (precomputed, labelled early result). Any other TGS gets Tamara's model, run live.

Mocked for Wednesday: scan measurement, and the safety findings that depend on it. The approach for each must still be clear and buildable, because technical feasibility is 30% of the mark.

## Hackathon facts

- Dates: Tue 29 Sep to Thu 1 Oct 2026.
- Pre-screening submission: Wed 30 Sep, 12:30pm, on Canvas. 3 slides: overview, tech and progress with MVP plan, and optional visuals.
- Top 12 to 15 teams present on Thu 1 Oct.
- Marking: potential effectiveness 40%, technical feasibility 30%, originality 15%, viability 10%, presentation 5% (final only).
- Code must be in a public repo. Every third-party tool, API and dataset goes in THIRD_PARTY.md.

## Open questions

When one is answered, delete it here, add a line to Decisions, and update the section it affects.

- Is the impact based on the plan as drawn, or the plan fitted to the scanned street?
- How does a photogrammetry scan get its true scale, and is it accurate enough to measure footpath widths?

## Decisions

Newest at the bottom. Format: `[date] Who: what was decided. Why, if not obvious.`


- [29 Sep] Team: the app is called Barrier Brain. Mobile web app on Vercel, not native.
- [29 Sep] Advait: the user is someone at a road company. Either the planner who drew the TGS, or whoever sets it up or verifies it. Refine later.
- [29 Sep] Advait: report "before" is the street with no works. "After" is the plan corrected for what the scan found. For now the report must look good and feel plausible.
- [29 Sep] Advait: base reference data feeds the simulation as well as the report.
- [29 Sep] Advait: the TGS gives the hours of the works. The planner does not enter them.
- [29 Sep] Advait: a scan fails the check if it misses the spot it was meant to cover. Checked by phone location at upload, within about 15 m (the 15 m is a guess).
- [29 Sep] Advait: scan measurement is geometry code (Open3D, trimesh, laspy), then the agent reads the numbers. Mocked for Wednesday, but the approach must be clear. See "Scan measurement".
- [29 Sep] Advait: the report is saved to the device as a PDF. On return home the share sheet opens to email it. For the demo it only needs to be viewable.
- [29 Sep] Advait: past projects live in localStorage. Supabase maybe later.
- [29 Sep] Advait: target is the Wed 30 Sep 12:30pm submission (3 slides plus a video demo), mocked where needed. Thursday only if shortlisted.
- [29 Sep] Advait: the agents run on Claude. Claude reads the TGS for real in the Wednesday video. The other steps can stay mocked.
- [29 Sep] Tamara: the impact model is a lookup from past closures plus a queue calculation, not machine learning. It is explainable, and its point estimate does not beat "no change", so it is shown as a range and a risk. Code and outputs in `model/`.
- [29 Sep] Frontend requester: final UI board and supplied copy lock the nine-screen mobile flow. External LiDAR upload, incomplete-scan retry gate, review-required report with recommended actions, and document preview. No native scanning or AR. Structured demo quantities and severities remain separate from AI explanations. Explicit Share replaces automatic sharing on return home for this prototype.
- [30 Sep] Tim: Claude calls go through Vercel AI Gateway, using the official Anthropic SDK pointed at the gateway. It sits in our existing Vercel project, so there is no separate Anthropic key or account. On Vercel it authenticates with the project's OIDC token.
- [30 Sep] Tim: the TGS analysis runs on Claude Sonnet 5.5, not Opus, to fit a student budget. Claude models need paid AI Gateway credit; the free monthly credit doesn't cover them.
- [30 Sep] Tim: impact models are swappable behind one result shape, so we are not locked into one approach. Tamara's model runs live as the default; SUMO is being tested. The report shows which method produced its numbers, and severity comes from one written rule.
- [30 Sep] Tim: SUMO is the default impact model where it has a result (the Swanston sample), with Tamara's model everywhere else. A review showed the lookup overstates Swanston: it assumes half the intersection's traffic uses the closed block, which is mostly tram only.
- [30 Sep] Advait: site scans use photogrammetry instead of LiDAR.
- [30 Sep] Joel: scan points come from the TGS analysis on every scan screen (it was 8 points, then 5 fixed areas). One site scan covers every scan point (Joel, later on 30 Sep: reverted from one scan per point). The scan is measured in the browser in TypeScript, not in Python, so no upload limit applies. Claude compares plan and measurements (`/api/site-check`) and writes the safety finding and actions; rules on the measurements are the fallback. The demo scan keeps the fixed Swanston findings.
- [30 Sep] Joel: real Scaniverse LAS scans (iPhone 16, no LiDAR, so photogrammetry; georeferenced) find the kerb, but footpath widths are not yet reliable on them. The app says "not measured reliably, check on site" instead of reporting a width.

## Terms

- **TGS, traffic guidance scheme.** A scale drawing of a work zone. It shows signs, barriers, cones, VMS boards, traffic controllers and the paths for vehicles and pedestrians. Usually drawn in a tool like RapidPlan over an aerial photo.
- **TMP, traffic management plan.** The full document for a job. It covers traffic, pedestrians, cyclists, public transport, hours, risks and approvals. It contains one or more TGSs.
- **TTM, temporary traffic management.** The general practice of managing traffic around works.
- **AGTTM.** The Austroads Guide to Temporary Traffic Management. The national standard, adopted in Victoria in December 2023.
- **Road authority.** The body that approves the TMP. The City of Melbourne approves most CBD streets. The Department of Transport and Planning approves arterial roads. Yarra Trams must also approve works on tram roads or within 20 m of a tram stop.
- **Work zone.** The area closed off for the works.
- **Traffic controller.** A worker who stops and releases traffic with a stop/slow bat.
- **VMS board.** A variable message sign. An electronic sign on a trailer.
- **Clear width.** The usable width of a footpath or lane after obstacles. The City of Melbourne sets a minimum clear footpath width for each CBD street, from 1.5 m to 3.0 m.
- **Kerbside lane.** The traffic lane next to the kerb. Often the first lane a work zone takes.
- **SCATS.** The traffic signal system used in Victoria and NSW. Victoria publishes 15-minute vehicle counts from it.
- **RADAR.** The Melbourne road closure records the impact model trains on.
- **GTFS.** The standard timetable format for public transport. PTV publishes static and realtime feeds for trams and buses.
- **Pedestrian Counting System.** City of Melbourne sensors that count people walking, hourly, at about 100 locations.
- **LiDAR.** A depth sensor in iPhone Pro models. It measures to within a few centimetres at up to about 5 m.
- **Photogrammetry.** Building a 3D model from many overlapping photos. It needs a known length in the scene to get the true scale.
- **Scaniverse.** A free phone app by Niantic that makes 3D scans from photos or LiDAR.
- **SUMO.** A free, open-source traffic microsimulator that imports OpenStreetMap.
- **Georeferencing.** Matching points on a drawing to real map coordinates to recover its scale and position.
