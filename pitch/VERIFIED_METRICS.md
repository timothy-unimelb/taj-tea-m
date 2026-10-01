# Verified metrics for the slides

Checked against the repo, the live app and the sources on 1 Oct 2026, after Tim's SUMO rerun of the demo site (real Faraday St signal phases). Where this file differs from FEASIBILITY.md or SLIDE_NUMBERS.md, this file is newer. The slide-ready table is at the bottom.

Labels:
- **[Sourced]** a published figure. Reference at the bottom.
- **[Model]** our SUMO run or our lookup model.
- **[Measured]** counted or timed by us, or read from open data counts.
- **[Assumption]** our estimate. Say so if asked. Confirm with Josh at RPM Hire where marked.

## 1. The numbers on the checklist

| Figure | Verdict | Exact value and label | Where it comes from |
|---|---|---|---|
| 2,700+ closures | Correct, but pick one | **About 2,700** Melbourne closures in the lookup model [Measured]. The full dataset holds **3,075** closures on 801 streets, Feb 2024 to Sep 2026 [Measured]. | model/README.md; model/data/closure_site_hour.parquet. Use 2,700 for "built on", 3,075 for "we measured every closure". |
| 9 junctions | Belongs to the other site | **9 junctions** with car counts per approach are the La Trobe St (CBD) SUMO site [Measured]. The demo site uses **7** junctions read from DTP signal sheets plus 6 whole-site totals. | model/sumo/README.md |
| 90% GEH ≤ 5 | Correct for the demo site only | **90% of 300 counted street-hours within GEH 5** (100% within GEH 10) on the demo site [Model]. The La Trobe St site is **71%**. Do not pair 90% with "9 junctions". | model/sumo/output/smac/facts.json |
| 11,500 → 1,800 (−84%) | Real, but do not headline it | The lookup model's worst case for the **La Trobe St sample** (full closure, Mon 7am to 10pm) against night works, 8pm to 5am [Model]. Worst-case (90th percentile) values, a night window 6 hours shorter, and a model that warns it may greatly overstate tram streets. Our SUMO run of the same closure gives about **123 drivers**. Drop it, or show it only as "the lookup's work window comparison" with the caveat. | Live app, /api/impact on data/mock/tgs/swanston-analysis.json |
| ~900 turnarounds a day | Reword | **889 drivers** (888 to 895) must leave Swanston St at Faraday St over the works [Model]. The lane's own detector counts **888** a day [Measured]. Both VMS boards stand past the turn, so all of them reach the closure before the detour sign. Say "about 900 drivers a day reach the closure before they see the detour". | facts.json; DTP traffic signal volume data, site 4392 detector 5 |
| 708 pedestrians an hour | Correct | **708 people an hour**, 1pm to 2pm, typical weekday over 8 weeks to 30 Sep 2026 [Measured]. 698 from 12pm to 1pm. The sensor is on the west footpath; the works are on the east side, so it is an estimate for that side. | City of Melbourne pedestrian counting system, sensor "Grattan St-Swanston St (West)" |
| ~1,400 passes a day | Correct as a sum | **About 1,400 people** walk past from noon to 2pm (698 + 708) [Measured], the hours the report tells planners to keep plant still. | Same sensor |

## 2. The demo site, after the SUMO rerun

Swanston St southbound closed between Faraday St and Grattan St, Mon to Fri, 9:30am to 3:30pm.

| Metric | Value | Label |
|---|---|---|
| Drivers diverted over the works | 889 (888 to 895), 141 to 167 an hour | [Model], matches 888 [Measured] |
| Extra time per diverted trip | about 31 s (29 to 39) | [Model] |
| Extra driving, diverted trips | about 8 vehicle-hours a day (7.1 to 9.5) | [Model] |
| All traffic within 600 m | no change beyond normal day-to-day variation | [Model] |
| Detour streets, cars an hour | Faraday St 41 → 160, Cardigan St 187 → 309, Grattan St 301 → 429 (65% of one lane at its busiest) | [Model] |
| Longest queue | 45 m, up to 66 m (about 7 cars), Cardigan St | [Model] |
| Extra walking | none | [Model: plan and OpenStreetMap] |
| Footpath width the lunchtime crowd needs | 1.5 m clear; the plan keeps exactly 1.5 m | [Measured counts + council comfort rule, Sourced] |
| PTV permit | needed: the closure ends 14 m from the tram stop | [Measured from the plan and OpenStreetMap] |
| Cost of the delay | about A$200 a day, A$2,000 over two working weeks | 8 vehicle-hours × A$25 per vehicle-hour [Assumption, from ATAP travel time values] |

Superseded: 16 vehicle-hours, 22 s per trip and "$400 a day" were from before the rerun.

## 3. End-to-end cost of one job

The use case: the planner draws the TGS and uploads it, a worker scans the site, the planner uploads the scans and gets the report in seconds, then approves the TGS or reworks it and reruns the report on the same scan.

The job: one lane closed for one 6-hour day shift on a 40 km/h city street, like the demo TGS.

**The job itself, the same in every case:**

| Item | Cost | Label |
|---|---|---|
| TGS drawing | $139 to $250 | [Sourced $139; $250 Assumption] |
| 2 traffic controllers, day shift | $700 to $1,200 | [Sourced: $350 to $600 each] |
| Supervisor, one shift | $450 to $750 | [Sourced] |
| 2 VMS boards, minimum one-week hire | $550 to $1,300 | [Sourced: $275 to $650 a week each] |
| 20 water-filled barriers, one day | $300 to $500 | [Sourced: $15 to $25 a day each] |
| Barrier install and removal | $100 to $250 | [Sourced] |
| Signs, cones and bollards | $100 to $200 | [Assumption] |
| **Job subtotal** | **$2,339 to $4,450** | |

**A plan that fails on site:** $4,650 to $17,450. That is a redraw and re-lodge (about $3,500 [Sourced]), a crew called back for another shift (2 traffic controllers and a supervisor, $1,150 to $1,950 [Sourced rates]) and, at the high end, a lost shutdown day (about $12,000 [Sourced]). Another source puts a lost day at $15,000 to $50,000 or more, so the high end is conservative.

**Checking and rework:**

| | Current | MVP | Polished at scale |
|---|---|---|---|
| Site scan trip, 2 h of a worker | none | $74 to $120 [Sourced wage $37/h; Assumption $60/h charge-out and 2 h] | $37 to $60 (scan reused on half of jobs [Assumption]) |
| Barrier Brain report | none | about A$0.50 [Measured tokens × Sourced prices] | about A$0.10 [same] |
| Rework found on paper: 20% of plans [Assumption], redraw and rerun on the same scan | none | $28 to $50 | $28 to $50 |
| Rework found on site: 20% × $4,650 to $17,450 | $930 to $3,490 | half caught [Assumption]: $465 to $1,745 | three quarters caught [Assumption]: $233 to $873 |
| **Checking and rework, per job** | **$930 to $3,490** | **$568 to $1,916** | **$297 to $983** |
| **Total per job** | **$3,269 to $7,940** | **$2,907 to $6,366** | **$2,636 to $5,433** |
| **Saving per job** | | **$362 to $1,574 (11 to 20%)** | **$633 to $2,507 (19 to 32%)** |

## 4. Weeks to minutes, through the use case

| Step | Current workflow | With Barrier Brain |
|---|---|---|
| Read the plan, find what to check | The planner's judgement | 16 to 21 s [Measured] |
| Check the street | Nothing before setup. The rules say to watch people in the first week, then fix the plan [Sourced] | One trip of about 1 to 1.5 h, 10 to 15 min of it scanning [Assumption]. Stitching and measuring about 3 s, registration 58 s for two scans [Measured] |
| Impact estimate | Skipped for short jobs. A simple study takes 1 to 2 weeks, a full one 6 to 10 weeks, micro-simulation 3 to 9 months [Sourced] | 12 to 22 s for the site check, under 1 s for the impact estimate [Measured]. A full SUMO run takes 10 to 30 min [Measured] |
| Revise the plan | Found after lodgement or on the day: re-lodge, approval clock up to 15 business days again [Sourced], plus a lost shift | Edit the drawing and rerun the report in about 40 s on the same scan, before lodging |
| Permit | up to 15 business days [Sourced] | up to 15 business days. This does not change. |

## 5. Cost at scale

The job cost is the same in all three, so this compares checking, rework and the tool's running cost.

| | Current | MVP | Polished at scale |
|---|---|---|---|
| Checking and rework, per job | $930 to $3,490 | $568 to $1,916 | $297 to $983 |
| Melbourne, 1,190 closures a year near signals [Measured] | $1.1M to $4.2M | $0.7M to $2.3M | $0.35M to $1.2M |
| **Saving, Melbourne** | | **$0.4M to $1.9M** | **$0.75M to $3.0M** |
| Australia, about 6,000 signalised closures a year [Assumption: Melbourne × 5 by population] | $5.6M to $20.9M | $3.4M to $11.5M | $1.8M to $5.9M |
| **Saving, Australia** | | **$2.2M to $9.4M** | **$3.8M to $15.0M** |
| Tool running cost, Australia | none | about A$3,000 a year | about A$600 a year |
| Modelling a closure | $30,000 to $200,000 on top of the study fee, if bought at all [Sourced] | about A$0.50 | about A$0.10 |

### Per report, MVP and polished

Token use per report [Measured]: reading the TGS about 2,500 in and 4,000 out; the site check about 7,000 in and 3,500 out. USD converted at 0.698 USD per AUD.

| Step | MVP | Polished |
|---|---|---|
| Read the TGS (a drawing, so it needs a vision model) | Claude Opus 5.5: US$0.09 | Claude Sonnet 5.5: US$0.05 |
| Site check (text and numbers) | Claude Opus 5.5: US$0.10 | hosted open-weight model, Llama 3.3 70B: under US$0.01 |
| SUMO simulation | 8 vCPU cloud server, Sydney, 20 min: US$0.16 | 4 vCPU, saved normal-traffic runs per area: about US$0.03 |
| App hosting | under US$0.01 | under US$0.01 |
| **Per report** | **about US$0.35, A$0.50** | **about US$0.08, A$0.10** |

### What changes from MVP to Australia-wide

- **Open-weight models.** A hosted open-weight model costs about 55 times less than Claude Opus for the same tokens, a 98% cut [Sourced prices]. But Llama 3.3 70B reads text only. It can do the site check, not the TGS drawing. Reading drawings needs a vision model: Claude, a hosted open-weight vision model, or a model fine-tuned on TGS drawings.
- **A fine-tuned model on a rented GPU.** For example an AWS g5.xlarge at about US$734 a month (A$12,600 a year), paid whether it is used or not [Sourced]. It matches Claude Opus's cost at about 3,900 reports a month, but it only matches a hosted open-weight model at about 220,000 reports a month. It is worth it for accuracy on drawings or for keeping plans and scans in our own cloud account, not for price.
- **Vercel and a cloud server, together.** Vercel stays the app's host: Pro is US$20 per user a month, and it bills active CPU only, not the seconds spent waiting on Claude [Sourced]. SUMO runs for 10 to 30 minutes, too long for Vercel's short-lived functions, so it needs a separate cloud server at US$0.06 to US$0.16 a run [Sourced]. Saving each area's normal-traffic runs means each closure only needs its closure runs, roughly halving that.
- **The biggest costs at scale are people, not compute.** Compute stays under A$0.50 a report. The rest: building and calibrating a model network for each new area (about half a day, then minutes per closure [Measured]), live data agreements (each state publishes signal and roadworks data differently), scan storage and privacy (scans can show faces and number plates), professional indemnity insurance, support, and an accredited planner who still signs off every plan. Scaniverse is free for 10 minutes of capture a month, then US$20 a month per scanner [Sourced].

## 6. Lives impacted in the next 5 years

Austroads' annual roadworks crash figures, held flat for five years [Assumption: no trend].

| | Next 5 years, Australia |
|---|---|
| Crashes at roadworks, police-recorded: 90 fatal, 1,225 serious injury, 2,650 minor injury | **3,965** [Sourced × 5] |
| On the real count: Queensland's workplace records held 6.4 times the police count | **about 25,000** [Sourced] |
| In the warning signs, taper and buffer: 25 to 30% of work zone crashes | **990 to 1,190**, including 22 to 27 fatal and 330 to 395 killed or seriously injured [Sourced × Sourced] |
| Avoided if Barrier Brain cuts roadwork crashes by 15% [Assumption] | **about 600**, including about 200 killed or seriously injured and about 13 deaths; about 3,800 on the real count |

Each figure counts crashes, and every crash involves at least one person, so "lives" is a floor. The 25 to 30% share is from US (Virginia) data. Grounds for 15%: we check the placement areas on every site and assume we catch about half of the crashes there; Austroads justified its own national program on 5%.

## 7. Proof it works, measured on the live build

| Step | Time | Where |
|---|---|---|
| Claude reads the TGS (test TGS, Vercel) | 16 to 21 s | /api/analyse-tgs, three runs 30 Sep |
| Two LAS scans stitched and measured in the phone's browser | about 3 s | local test, 30 Sep |
| Scan registration tool | 58 s for two scans | tools/scan_register |
| Claude checks the plan against the scan, with council counts (Vercel) | 12 to 22 s | /api/site-check, three runs |
| Lookup impact model (Vercel) | under 1 s | /api/impact |
| SUMO, demo site, every works hour × 5 runs | 10 to 30 min, offline | model/sumo |

## 8. Assets for the slide checklist

| Ask | File |
|---|---|
| Final TGS | data/test/swanston-smac-lane-closure.jpg (2400 × 1700). Remake at any size with data/test/make-smac-tgs.mjs. Issues to highlight: VMS 1 and 2 stand south of Faraday St, past the only detour turn; Faraday St westbound becomes a dead end; bus 546 drives the closed lane; the plant crossing is the one gap in the barriers; the 1.5 m footpath note; the 0.8 m tram envelope note. |
| Site scan | public/scans/swanston-st-site-scan.las (the demo scan); scans/swanston_registered_v2/ (registration notes) |
| SUMO outputs | public/assets/sumo-smac-detour.png (detour routes), public/assets/sumo-smac-clip.gif (the report's clip), model/sumo/output/smac/closure-signed.png and closure-closure.png (drivers following the signs vs knowing beforehand), model/sumo/output/swanston-closure.png (La Trobe St site) |
| Historical closure model | model/mvm/output/mvm_lookup.csv, mvm_validation_summary.csv, mvm_validation_risk_bands.csv |

## 9. Slide-ready numbers

Short, rounded and safe to say on stage. Labels in brackets for the Q and A.

| Claim | Today | With Barrier Brain | Basis |
|---|---|---|---|
| Know a closure's impact | 6 to 10 weeks | under 2 minutes | Feasly study times [S]; live app [M] |
| Re-check a revised plan | up to 15 business days | under 1 minute | City of Melbourne [S]; live app [M] |
| Model one closure | $30,000+ | 50 cents | Feasly [S]; tokens × prices [M] |
| Cost of a plan that fails on site | $4,650 to $17,450 | caught on paper | vendor rates [S] |
| Checking and rework, per job | $930 to $3,490 | $570 to $1,920 (MVP), $300 to $980 at scale | section 3 [S + A] |
| Saving, Melbourne, a year | | $0.4M to $1.9M (MVP), up to $3M at scale | 1,190 closures [M], 20% revised [A] |
| Saving, Australia, a year | | $2.2M to $9.4M (MVP), up to $15M at scale | 6,000 closures [A] |
| Run every Melbourne closure for a year | not done | about A$600 (MVP), A$120 at scale | 1,190 × A$0.50 / A$0.10 [M] |
| Lives impacted at Australian roadworks, next 5 years | about 4,000 (25,000 on the real count) | about 600 spared | Austroads, Blackman et al. [S]; 15% [A] |
| Crashes in the signs and tapers we check | about 1 in 4 | checked on every site | Garber and Zhao [S] |
| Demo plan: drivers missing the detour | about 900 a day | flagged before setup | SUMO [M], lane count 888 [M] |
| Demo plan: lunchtime walkers on a footpath with no spare width | about 1,400 | flagged before setup | council sensor [M] + council rule [S] |
| Closures that last a week or less | 99.6% | | our RADAR data, 3,075 closures [M] |

## References

Anthropic. (2026). *Pricing*. https://platform.claude.com/docs/en/about-claude/pricing

Austroads. (2022). *National harmonisation of temporary traffic management practice: Benefit-cost analysis* (Report No. AP-R678-22). https://austroads.gov.au/publications/temporary-traffic-management/ap-r678-22

Australian Transport Assessment and Planning. (n.d.). *PV2 road parameter values: 3. Travel time*. https://www.atap.gov.au/parameter-values/road-transport/3-travel-time

Blackman, R., Debnath, A. K., & Haworth, N. (2020). Understanding vehicle crashes in work zones: Analysis of workplace health and safety data as an alternative to police-reported crash data in Queensland, Australia. *Traffic Injury Prevention, 21*(3), 222–227. https://doi.org/10.1080/15389588.2020.1734190

City of Melbourne. (n.d.). *Consent for works: Road works*. https://www.melbourne.vic.gov.au/consent-works-road-works

City of Melbourne. (2026). *Pedestrian counting system: Monthly counts per hour* [Data set]. https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/

DeepInfra. (n.d.). *Pricing*. https://deepinfra.com/pricing

Department of Transport and Planning. (2026). *Traffic signal volume data* [Data set]. DataVic. https://discover.data.vic.gov.au/dataset/traffic-signal-volume-data

DevZero. (n.d.). *AWS c7i.2xlarge pricing*. https://www.devzero.io/instances/aws/c7i.2xlarge

Feasly. (2026, April 22). *Traffic impact assessment Australia: Complete developer's guide 2026*. https://www.feasly.com.au/guides/traffic-impact-assessment-australia-developer-guide

First Class Traffic Solutions. (n.d.). *How much does traffic management plan cost?* https://firstclasstrafficsolutions.com.au/how-much-does-traffic-management-plan-cost/

Garber, N. J., & Zhao, M. (2002). *Crash characteristics at work zones* (Report No. VTRC 02-R12). Virginia Transportation Research Council. https://rosap.ntl.bts.gov/view/dot/20448

Indeed. (n.d.). *Traffic controller salary in Melbourne VIC*. https://au.indeed.com/career/traffic-controller/salaries/Melbourne-VIC

iSeekPlant. (2023, July 4). *Variable message board (VMB) & traffic message board hire rates 2025*. https://www.iseekplant.com.au/blog/variable-message-board-vms-hire-rates

iSeekPlant. (n.d.). *Traffic barriers near me*. https://www.iseekplant.com.au/traffic-barriers

Niantic Spatial. (n.d.). *Pricing*. https://www.nianticspatial.com/en/pricing

One Stop Traffic Solutions. (2026, August 28). *Civil construction traffic management costs in Australia: A complete breakdown*. https://onestoptrafficsolutions.com.au/civil-construction-traffic-services-costs-australia/

OpenStreetMap contributors. (2026). *OpenStreetMap* [Data set]. https://www.openstreetmap.org

Pantzar, M. (2012). *Pedestrian level of service and trip generation: International best practice and its applicability to Melbourne*. City of Melbourne. https://s3.ap-southeast-2.amazonaws.com/hdp.au.prod.app.com-participate.files/9914/1222/6191/COM_SERVICE_PROD-_8552764-v1-Walking_Plan_Technical_Report_-_Best_Practice_Pedestrian_Level_of_Service_and_Trip_Generation.pdf

Transport for London. (2010). *Pedestrian comfort guidance for London*. https://content.tfl.gov.uk/pedestrian-comfort-guidance-technical-guide.pdf

Transport for NSW. (2023). *Traffic control at work sites* (Technical Manual 20.346). https://www.transport.nsw.gov.au/system/files/media/documents/2023/traffic-control-at-work-sites.pdf

Vantage. (n.d.). *AWS c7i.xlarge pricing*. https://instances.vantage.sh/aws/ec2/c7i.xlarge

Vercel. (n.d.). *Pricing*. https://vercel.com/pricing

Western Sydney Trades. (2026, July 19). *CTMP cost guide 2026: How much does a traffic plan cost?* https://westernsydneytrades.com.au/ctmp-cost/

Not yet rechecked by us (from the team's research in FEASIBILITY.md): Anthropic, City of Melbourne consent page, DeepInfra, DevZero, Niantic Spatial, Transport for NSW, Vantage and Vercel. The rest were opened and checked on 30 Sep or 1 Oct 2026.
