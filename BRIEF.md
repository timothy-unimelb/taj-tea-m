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
3. The planner scans those places with Scaniverse on a LiDAR iPhone. They upload the scans.
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
- **App.** Analyse TGS, then identify points of interest to scan, then LiDAR site scan, then analyse site scan, then simulate traffic flow, then generate report and metrics. The base reference data feeds into both the simulation and the report. (The flowchart only shows the report. The simulation needs it too.)
- **Organisational process.** The report goes to the team.

## Screens

From the whiteboard sketch. The sketch splits the flow into two phases: preparation, then on-site scan. See DESIGN.md for the screen list.

## Components

- **Analyse TGS (agent).** Reads the layout, the equipment, the pedestrian routes and the widths the plan assumes. Works out the drawing's scale by matching features to map data with coordinates. Use City of Melbourne open data or Vicmap. Google Maps terms ban extracting data from its imagery.
- **Identify scan points (agent).** Picks every place where the plan assumes there is enough space. Both edges of the zone, both ends, where pedestrians are sent, each sign and equipment position, and where work vehicles park.
- **Scan.** Scaniverse in LiDAR mesh mode, exported as PLY, LAS or OBJ. A later version may use our own scanner that keeps data when the phone moves.
- **Scan check.** A scan fails if it misses the spot it was meant to cover. Check: the phone's location at upload (browser geolocation) must be within about 15 m of the scan point. Later, also check the scan contains the expected feature, such as a kerb.
- **Analyse scans.** Two parts. Code measures the scan. The agent interprets the measurements. See "Scan measurement" below.
- **Impact model.** The planned approach is machine learning trained on past road closures: about 30,000 Melbourne closures from RADAR, matched to SCATS signal counts from 2024 to 2026. **For the demo the results are mocked.** Fallbacks, heaviest first: SUMO microsimulation, a work-zone queue model, diversion routing on OpenStreetMap.
- **Base reference data.** Traffic, pedestrian and public transport data from APIs. Where it feeds in is not decided.
- **Report.** Generated in the app and saved to the device as a PDF. On return home, the phone's share sheet opens so the planner can email it to their team (Web Share API).
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

The layout is not decided. Current draft:

- Header: date, time and location.
- Before and after tables for pedestrians, buses and trams, cars, and trucks.
- An in-app summary with visuals, plus a PDF export.

"Before" is the street with no works. "After" is the plan once it is corrected for what the scan found. We will tune this once the agents run on real data. For now the report must look good, read easily and feel plausible.

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

Mocked for Wednesday: impact model results, scan measurement. The approach for each must still be clear and buildable, because technical feasibility is 30% of the mark.

## Hackathon facts

- Dates: Tue 29 Sep to Thu 1 Oct 2026.
- Pre-screening submission: Wed 30 Sep, 12:30pm, on Canvas. 3 slides: overview, tech and progress with MVP plan, and optional visuals.
- Top 12 to 15 teams present on Thu 1 Oct.
- Marking: potential effectiveness 40%, technical feasibility 30%, originality 15%, viability 10%, presentation 5% (final only).
- Code must be in a public repo. Every third-party tool, API and dataset goes in THIRD_PARTY.md.

## Open questions

Answers go here, then into the sections above.

- Does the report only flag problems, or also suggest fixes using equipment inventory (move a barrier, add a sign, add a VMS board)?
- Which metrics per mode (delay, queue length, detour distance, footpath width)?
- Is the impact based on the plan as drawn, or the plan fitted to the scanned street?
- Which model runs the agents?
- Does the TGS analysis run for real in the Wednesday video, or is it mocked too?

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
- **Scaniverse.** A free iPhone app by Niantic that makes 3D scans using LiDAR.
- **SUMO.** A free, open-source traffic microsimulator that imports OpenStreetMap.
- **Georeferencing.** Matching points on a drawing to real map coordinates to recover its scale and position.
