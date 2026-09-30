# Verified metrics for the slides

Checked against the repo and the live app on 1 Oct 2026, after Tim's SUMO rerun of the demo site (real Faraday St signal phases). Use these values. Where they differ from FEASIBILITY.md or SLIDE_NUMBERS.md, this file is newer.

Labels:
- **[Sourced]** a published figure, with its link.
- **[Model]** our SUMO run or our lookup model.
- **[Measured]** counted or timed by us, or read from open data counts.
- **[Assumption]** our estimate. Say so if asked. Confirm with Josh at RPM Hire where marked.

## The numbers on the checklist

| Figure | Verdict | Exact value and label | Where it comes from |
|---|---|---|---|
| 2,700+ closures | Correct, but pick one | **About 2,700** Melbourne closures in the lookup model [Measured]. The full dataset holds **3,075** closures on 801 streets, Feb 2024 to Sep 2026 [Measured]. | model/README.md; model/data/closure_site_hour.parquet. 2,700 are the ones matched to signal counts. Use 2,700 for "built on", 3,075 for "we measured every closure". |
| 9 junctions | Belongs to the other site | **9 junctions** with car counts per approach are the La Trobe St (CBD) SUMO site [Measured]. The demo site uses **7** junctions read from DTP signal sheets plus 6 whole-site totals. | model/sumo/README.md, "Car counts per approach" and "Second site". |
| 90% GEH ≤ 5 | Correct for the demo site only | **90% of 300 counted street-hours within GEH 5** (100% within GEH 10) on the demo site [Model]. The La Trobe St site is **71%**. Do not put 90% next to "9 junctions": they are different runs. | model/sumo/output/smac/facts.json, calibration; model/sumo/README.md. |
| 11,500 → 1,800 (−84%) | Real, but do not headline it | The lookup model's worst case for the **La Trobe St sample** (full closure, Mon 7am to 10pm) against night works 8pm to 5am [Model]. Three problems: they are worst-case (90th percentile) values, the night window is 6 hours shorter, and the model itself warns it "may greatly overstate" a tram street. Our SUMO run of the same closure gives about **123 drivers**, not 11,500. | Live app, /api/impact on data/mock/tgs/swanston-analysis.json, `recommended_window`. Recommendation: drop it, or show it only as "the lookup's work window comparison" with the caveat. |
| ~900 turnarounds a day | Reword | **889 drivers** (888 to 895) must leave Swanston St at Faraday St over the works [Model]. The lane's own detector counts **888** a day [Measured, SCATS site 4392 detector 5]. Both VMS boards stand past the Faraday St turn, so all of them reach the closure before the detour sign. Say "about 900 drivers a day reach the closure before they see the detour". Whether each one turns around is our reading, not a count. | facts.json, diverted_drivers; the test TGS. |
| 708 pedestrians an hour | Correct | **708 people an hour**, 1pm to 2pm, typical weekday over 8 weeks to 30 Sep 2026 [Measured, City of Melbourne sensor "Grattan St-Swanston St (West)"]. 698 from 12pm to 1pm. The sensor is on the west footpath; the works are on the east side, so it is an estimate for that side. | data.melbourne.vic.gov.au pedestrian counting system. |
| ~1,400 passes a day | Correct as a sum | **About 1,400 people** walk past between noon and 2pm (698 + 708) [Measured, same sensor], the hours the report tells planners to keep plant still. | Same sensor. |

## The demo site, updated after the SUMO rerun

The demo TGS closes Swanston St southbound between Faraday St and Grattan St, Mon to Fri, 9:30am to 3:30pm.

| Metric | Value | Label |
|---|---|---|
| Drivers diverted over the works | 889 (888 to 895), 141 to 167 an hour | [Model], matches 888 [Measured] |
| Extra time per diverted trip | about 31 s (29 to 39) | [Model] |
| Extra driving, diverted trips | **about 8 vehicle-hours a day** (7.1 to 9.5) | [Model] |
| All traffic within 600 m | no change beyond normal day-to-day variation | [Model] |
| Detour streets, cars an hour | Faraday St 41 → 160, Cardigan St 187 → 309, Grattan St 301 → 429 (65% of one lane at its busiest) | [Model] |
| Longest queue | 45 m, up to 66 m (about 7 cars) on Cardigan St | [Model] |
| Extra walking | none | [Model: plan and OpenStreetMap] |
| Footpath width the crowd needs, 12pm to 2pm | 1.5 m clear, and the plan keeps exactly 1.5 m | [Measured counts + council comfort rule, Sourced] |
| PTV permit | needed: the closure ends 14 m from the tram stop | [Measured from the plan and OpenStreetMap] |
| Cost of the delay | **about A$200 a day**, A$2,000 over two working weeks | 8 vehicle-hours x A$25 per vehicle-hour [Assumption, from ATAP PV2 travel time values] |

**Outdated in FEASIBILITY.md, "One site":** it says 16 vehicle-hours and about $400 a day. That was before the rerun. Use about 8 vehicle-hours and about A$200 a day. The 16 vehicle-hours and 22 s figures are superseded.

## Value to the workflow

| Metric | Today | With Barrier Brain | Label |
|---|---|---|---|
| Cost of a plan that fails on site | $4,000 to $16,000: redraw and re-lodge about $3,500, crew callback $600 to $1,500, a lost shutdown day about $12,000 | caught before setup | [Sourced: Western Sydney Trades 2026, One Stop Traffic 2026] |
| Closures a year, Melbourne, near signals | 1,190 | same | [Measured, our RADAR data] |
| Share of plans revised | 20% | | [Assumption, confirm with Josh] |
| Revisions caught before setup | | half | [Assumption, confirm with Josh] |
| Money saved a year, Melbourne signalled streets | | about 119 revisions avoided x $4,000 to $16,000 = **$0.5 million to $1.9 million** | [Assumption-based calculation] |
| Approval time saved a year | | 119 x 15 business days = **about 1,800 business days** of waiting | [Sourced 15 days, DTP average; count is Assumption-based] |
| Cost to model one closure | micro-simulation $30,000 to $200,000, so short jobs get none | about A$0.50 a report | [Sourced: Feasly 2026] / [Measured tokens x published prices] |
| Every Melbourne closure near a signal, a year | not done | about A$600 | [Calculation: 1,190 x A$0.50] |
| Time from plan to impact | 15 business days for a permit, weeks for a model | under an hour | [Sourced permit time] / [Measured, below] |

Drop from earlier drafts: "500 jobs a year", "10 to 20% rework", "$1,000 to $1,500 per rework" and "1.5 h planner site check". Those were placeholders. The sourced vendor costs and our RADAR count replace them.

## Proof it works, measured on the live build

| Step | Time | Where |
|---|---|---|
| Claude reads the TGS (test TGS, Vercel) | 16 to 21 s | /api/analyse-tgs, three runs 30 Sep |
| Two LAS scans stitched and measured in the phone's browser | about 3 s | local test, 30 Sep |
| Scan registration tool (Tamara and Advait) | 58 s for two scans | tools/scan_register |
| Claude checks the plan against the scan, with council counts (Vercel) | 12 to 22 s | /api/site-check, three runs |
| Lookup impact model (Vercel) | under 1 s | /api/impact |
| SUMO, demo site, every works hour x 5 seeds | 10 to 30 min, run offline | model/sumo |

## Assets for the slide checklist

| Ask | File |
|---|---|
| Final TGS | data/test/swanston-smac-lane-closure.jpg (2400 x 1700). Remake at any size with data/test/make-smac-tgs.mjs. Issues to highlight: VMS 1 and 2 stand south of Faraday St, past the only detour turn; Faraday St westbound becomes a dead end; bus 546 drives the closed lane; the plant crossing is the one gap in the barriers; the 1.5 m footpath note; the 0.8 m tram envelope note. |
| Site scan | public/scans/swanston-st-site-scan.las (the demo scan); scans/swanston_registered_v2/ (registration notes). Top-down renders of the merged scan can be remade from data/test/merge-las.mjs output. |
| SUMO outputs | public/assets/sumo-smac-detour.png (detour routes), public/assets/sumo-smac-clip.gif (the report's clip), model/sumo/output/smac/closure-signed.png and closure-closure.png (drivers following the signs vs knowing beforehand), model/sumo/output/swanston-closure.png (La Trobe St site) |
| Historical closure model | model/mvm/output/mvm_lookup.csv, mvm_validation_summary.csv, mvm_validation_risk_bands.csv |
| Sources | pitch/FEASIBILITY.md holds the external links. Add: City of Melbourne pedestrian counting system (data.melbourne.vic.gov.au), City of Melbourne "Pedestrian Level of Service and Trip Generation" (2012) for the crowding rule. |
