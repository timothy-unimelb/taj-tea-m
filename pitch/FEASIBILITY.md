# Feasibility: the numbers behind the pitch

Research for the feasibility section of the Thursday 1 Oct pitch. Every figure has a source. Every calculation shows its assumptions, so anyone on stage can explain how we got there. Figures gathered 30 Sep 2026.

Where a number is our own estimate, it says "our estimate" and gives the working. Do not present those as published facts.

## 1. The three claims in the hook

The hook says: hundreds of lives, millions of dollars, months of effort. Here is what backs each one.

### Lives

Roadwork crashes in Australia, per year:

| Type | Crashes a year |
|---|---|
| Fatal | 18 |
| Serious injury | 245 |
| Minor injury | 530 |

Source: Austroads AP-R678-22, National Harmonisation of Temporary Traffic Management Practice: Benefit-cost Analysis, Sep 2022. Built from crash data supplied by every state road agency. Cost of those crashes over 10 years: $3.2 billion (4% discount rate). https://austroads.gov.au/publications/temporary-traffic-management/ap-r678-22

Over ten years that is about 180 deaths and 2,450 serious injury crashes. That is the police count. Queensland's workplace safety records held 820 work zone crashes in 45 months against 128 in police data, about 6 times more. (Blackman, Debnath and Haworth, Traffic Injury Prevention, 2020. https://pubmed.ncbi.nlm.nih.gov/32154733/)

For scale overseas: 850 to 960 people died in US work zones each year from 2021 to 2024 (FHWA Work Zone Safety Clearinghouse, from NHTSA FARS. https://workzonesafety.org/work-zone-data/work-zone-fatal-crashes-and-fatalities/).

The claim "save hundreds of lives", and how we get there. Lives means people killed or seriously injured. Serious injury means hospitalised, often for weeks. The chain:

| Step | Figure | Basis |
|---|---|---|
| People killed or seriously injured at Australian roadworks a year | at least 263 | 18 fatal + 245 serious injury crashes, Austroads |
| Share of work zone crashes in the placement-defined areas (warning signs, taper, buffer) | 25 to 30% | Garber and Zhao, Virginia, 2002, 1,484 crashes: advance warning 8.7 to 11.3%, transition 11.0 to 16.2%, buffer 4.5 to 6.5% |
| Reduction we assume at sites that use Barrier Brain | 15% | Our assumption: we check placement on every site and catch about half of those crashes. Austroads justified its whole national program on 5%, and that was a paperwork change |
| People a year not killed or seriously injured | 39 | 263 x 15% |
| Over a decade, Australia | about 400 | 39 x 10 |
| Correction for police undercount | x 6.4 | Queensland: 820 work zone crashes in safety records vs 128 in police data (Blackman, Debnath and Haworth, 2020) |

So: hundreds of lives a decade in Australia on the police count, thousands on the real count. Overseas, the US loses 850 to 960 people a year in work zones; 15% of that is about 135 lives a year.

Garber source: https://rosap.ntl.bts.gov/view/dot/20448/dot_20448_DS1.pdf

Three groups of people, so the claim covers drivers, pedestrians and workers:
- Drivers: the Austroads figures above. 71% of fatal US work zone crashes involve speeding, against 30% of fatal crashes overall (FHWA). In Australia 52 to 98% of vehicles speed on the approach to worksites (CARRS-Q, 2020). Drivers do not slow down for what they cannot see coming. Sight distance to the first barrier is one of the things the scan checks.
- Pedestrians: 56 pedestrian deaths and about 2,200 hospital-treated pedestrian injuries a year in Victoria. The densest cluster of pedestrian crashes in the state is the Melbourne CBD, Southbank to Carlton, where roadworks are also densest (Victoria Walks and MUARC, Understanding Pedestrian Crashes in Victoria, 2008 to 2018 data. https://www.victoriawalks.org.au/Assets/Files/Understanding-Pedestrian-Crashes.pdf). Our demo site is in Carlton.
- Workers: about 100 traffic controllers injured a year needing treatment or time off, and at least one killed (NRSPP fact sheet, 2020. https://www.nrspp.org.au/resources/nrspp-fact-sheet-driver-safety-at-roadworks/). 49% of controllers say they were nearly struck by a distracted driver in the past year (TMAA survey, 2024, 1,500 respondents. https://roadsonline.com.au/tmaa-survey-shines-light-on-safety/).

Cost of the crashes avoided. $3.2 billion over 10 years is about $320 million a year (Austroads). 15% is $48 million a year. BITRE's 2020 per-crash costs give a lower base (fatal $3.2m, hospitalised $261k, minor $30.4k: about $138 million a year, so 15% is about $21 million). Quote Austroads on stage since it is the roadworks-specific study.

Why a plan check should move this number. Crashes at roadworks come from what drivers meet on the day: a barrier round a bend, a sign that has fallen, a detour across an unsignalled crossing. Two evidence points:
- WorkSafe Victoria, 300 inspections of roadside sites, found "inadequate signage for road users" and crews near each other "causing multiple traffic diversions". https://www.worksafe.vic.gov.au/news/2017-12/put-safety-first-roadside-construction-sites
- Transport for NSW requires pedestrian movements at a work site to be "observed, especially during the first week, and necessary changes made". Traffic Control at Work Sites 20.346, section 4.4.2. https://www.transport.nsw.gov.au/system/files/media/documents/2023/traffic-control-at-work-sites.pdf The rule admits the plan is not checked against real behaviour until the site is live. Barrier Brain moves that check to before setup.

### Dollars

Congestion cost, avoidable social cost (BITRE, Traffic and congestion cost trends for Australian capital cities, Nov 2015. https://www.bitre.gov.au/sites/default/files/is_074.pdf):

| | 2015 | 2030 projection |
|---|---|---|
| Australia (8 capitals) | $16.5 billion | $27.7 to $37.3 billion |
| Melbourne | $4.6 billion | $7.6 to $10.2 billion |
| Sydney | $6.1 billion | $9.5 to $12.6 billion |

Share caused by roadworks. No Australian figure exists. The US Federal Highway Administration puts work zones at 10% of all congestion and 24% of non-recurring delay. https://ops.fhwa.dot.gov/program_areas/reduce-non-cong.htm Applying the US 10% share to Australia, labelled as such:

| | Now | 2030 |
|---|---|---|
| Australia, roadworks congestion cost a year | about $1.65 billion | $2.8 to $3.7 billion |
| Melbourne | about $460 million | $760 million to $1 billion |

Working: 10% x $16.5 billion = $1.65 billion. 10% x $4.6 billion = $460 million.

What a small improvement is worth. If simulating a closure before it happens trims its delay by 5% (better work window, no dead-end streets, detour that fits), that is our assumption, not a study:

| Delay cut | Melbourne, a year | Australia, a year |
|---|---|---|
| 5% | $23 million | $83 million |
| 10% | $46 million | $165 million |

That is "millions of dollars" with a wide margin.

One site, from our own simulation. The demo TGS closes one southbound kerbside lane on Swanston St for six hours. SUMO shows 891 drivers diverted and about 16 vehicle-hours of delay within 600 m. At an official travel time value that is about $400 of delay a day for one lane, or $5,600 over a two-week job. (Value of time: ATAP PV2 gives $14.99 per person-hour private and about $48.60 business, in 2013 dollars, https://www.atap.gov.au/parameter-values/road-transport/index; we use A$25 per vehicle-hour as a round current figure.) The test TGS closes the whole direction and the lookup model puts that at about 1,500 diversions a day.

What getting the plan wrong costs today, per site. Published vendor rates, NSW and Victoria, 2026:

| Item | Cost |
|---|---|
| Plan revision and re-lodgement after rejection | about $3,500 |
| Traffic controller, day shift | $350 to $600 each |
| Supervisor, per shift | $450 to $750 |
| Truck-mounted attenuator, per day | $800 to $1,500 |
| A lost shutdown day (idle plant and crew) | about $12,000 |

Sources: Western Sydney Trades CTMP cost guide, 19 Jul 2026, https://westernsydneytrades.com.au/ctmp-cost/; One Stop Traffic Solutions, 28 Aug 2026, https://onestoptrafficsolutions.com.au/civil-construction-traffic-services-costs-australia/

So a plan that fails on site costs $4,000 to $16,000 to fix: a redraw, a crew called back, and often a lost day. A Barrier Brain report costs under a dollar to run (section 3).

What modelling costs today, which is why short jobs skip it:

| Item | Cost |
|---|---|
| TGS, single day job | $139 to $250 |
| TMP, local road | $800 to $2,500 |
| TMP, arterial, multi-stage or CBD | $3,000 to $15,000 |
| Micro-simulation study (VISSIM, Aimsun) | $30,000 to $200,000, CBD builds over $300,000 |

Sources: First Class Traffic Solutions https://firstclasstrafficsolutions.com.au/how-much-does-traffic-management-plan-cost/; MK Traffic Management https://mktrafficmanagement.com.au/construction-traffic-management-plan-melbourne/; Feasly TIA guide, Apr 2026, https://www.feasly.com.au/guides/traffic-impact-assessment-australia-developer-guide

### Months

Approval times today:

| Authority | Stated time |
|---|---|
| Victoria DTP, Memorandum of Authorisation | average 15 business days (2022) |
| City of Melbourne, consent for works | up to 15 business days; amendments up to 5 |
| Transport for NSW, Road Occupancy Licence | minimum 10 working days; extensions up to 10 more |
| Queensland TMR, traffic control permit | at least 10 business days |

Sources: VicRoads MoA FAQ, Mar 2022 (now offline, quoted by MK Traffic Jun 2026); https://www.melbourne.vic.gov.au/consent-works-road-works; TfNSW Road Occupancy Manual https://www.transport.nsw.gov.au/system/files/media/documents/2018/Road_Occupancy_Manual.pdf; https://www.tmr.qld.gov.au/business-industry/technical-standards-publications/traffic-control-permit

Each revision restarts the clock. Main Roads WA says it plainly: "Producing a traffic model as part of a technical report can reduce multiple TMP revisions and the lengthy approval periods associated with those revisions." Guidelines for Traffic Modelling, Temporary Traffic Management, Mar 2025. https://www.mainroads.wa.gov.au/499785/globalassets/technical-commercial/working-on-roads/traffic-management/guidelines-for-traffic-modelling.pdf

How many plans, and how short the jobs are. Our RADAR dataset (model/data/closure_site_hour.parquet) holds 3,075 Melbourne closures on 801 streets from 27 Feb 2024 to 27 Sep 2026, matched to traffic signals within 200 m. That is about 1,190 a year on signalled streets alone. The full count is higher. No authority publishes a total.

Their length, measured from the feed's start and end times:

| Closures lasting | Share |
|---|---|
| 1 day or less | 42% |
| 3 days or less | 82% |
| 7 days or less | 99.6% |
| Median | 1.5 days |

So the permit takes three weeks and 99.6% of the jobs take less than one. That is why nobody models them: a $30,000 study cannot be justified for a two-day closure. It also means the whole market is unmodelled, and a 50-cent report is the only thing that fits.

Our estimate of the time lost to revisions in Melbourne, stated as an estimate:

| Assumption | Value |
|---|---|
| Closures a year near signals | 1,190 (our data) |
| Share that need a revision | 20% (our assumption) |
| Delay per revision | 15 business days, 3 weeks (DTP's stated average) |
| Weeks of waiting a year | about 720 |

720 weeks is fourteen years of calendar time lost every year, in one city, on signalled streets alone. That is "months of effort" with room to spare.

What Barrier Brain takes, measured on our build:

| Step | Time |
|---|---|
| Claude reads the TGS | 17 s |
| Two phone scans fitted together | 58 s |
| Claude checks the scan against the plan | 14 s |
| SUMO simulation of the site | 10 to 30 min |

Under an hour from upload to report. A micro-simulation from a consultant takes weeks.

## 2. Is it useful, and would people use it

- Roadworks under about four weeks skip modelling. Main Roads WA's guideline requires SIDRA modelling only at medium risk and above, and says short jobs may use "site visits" instead. Nobody models a two-week lane closure. Barrier Brain does it for under a dollar.
- The people on site already carry the only hardware it needs. Scaniverse runs photogrammetry on iOS and Android with no LiDAR, free for 10 minutes of capture a month, $20 a month for more. https://www.nianticspatial.com/en/pricing
- 82% of traffic controllers support automated solutions that take them out of live lanes (TMAA 2025 survey, 1,600 respondents, summarised by RPM Hire. https://www.rpmhire.com.au/what-the-2025-traffic-controller-safety-survey-reveals-about-worksites/). The industry is asking for tools.
- Victoria's road occupation charge trial cut occupation periods by up to 75% once companies could see the cost of blocking a lane. https://www.premier.vic.gov.au/keeping-traffic-moving-across-melbourne/ Making the impact visible changes behaviour. Barrier Brain makes it visible before the permit.
- Workforce to reach: 16,100 road traffic controllers employed in Australia (Jobs and Skills Australia, 2021 Census. https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations/899923-road-traffic-controllers). Traffic management market $738 million in 2025, growing 7.6% a year (Technavio via Research and Markets).

Add the tradie's quote here if he said anything about using it.

## 3. Economics of running it

### Per report, today's build

Token use per report, measured from our prompts and saved outputs. TGS read: about 2,500 tokens in (prompt 550, image about 1,500 to 2,700, tool overhead), about 4,000 out. Site check: about 7,000 in (prompt 1,150, TGS analysis, scan measurements, council counts), about 3,500 out. Total about 9,500 in and 7,500 out.

Claude API prices, USD per million tokens, 30 Sep 2026. https://platform.claude.com/docs/en/about-claude/pricing

| Model | Input | Output | Claude cost per report |
|---|---|---|---|
| Opus 5.5 (live) | $4 | $20 | $0.19 |
| Sonnet 5.5 (test) | $2 | $10 | $0.09 |
| Haiku 4.5 | $1 | $5 | $0.05 |

Working for Opus: 9,500 x $4 / 1,000,000 + 7,500 x $20 / 1,000,000 = $0.038 + $0.15 = $0.19.

Other costs per report:

| Item | Cost | Source |
|---|---|---|
| SUMO, 20 min on 8 vCPU, Sydney (AWS c7i.2xlarge $0.466/hr) | $0.16 | https://www.devzero.io/instances/aws/c7i.2xlarge |
| SUMO, 20 min on 4 vCPU, US (c7i.xlarge $0.179/hr) | $0.06 | https://instances.vantage.sh/aws/ec2/c7i.xlarge |
| Vercel function time | under $0.01 | Active CPU $0.18/hr Sydney, pauses while waiting on Claude |
| Council data (SCATS, RADAR, pedestrian sensors, Vicmap) | $0 | open data |

Fixed: Vercel Pro $20 a month (https://vercel.com/pricing). Scaniverse free or $20 a month per scanner.

MVP total: about US$0.35 a report, or A$0.50 at 0.698 USD per AUD (xe.com, 30 Sep 2026).

### Per report, optimised

Three swaps, each with a source:

1. Open-weight model for the reading and checking. Hosted Llama 3.3 70B on DeepInfra: $0.10 in, $0.32 out per million. https://deepinfra.com/pricing Per report: 9,500 x 0.10 + 7,500 x 0.32, all over a million = $0.0034. About 55 times cheaper than Opus.
2. Fine-tune a small vision model on real TGS drawings. Evidence this works: fine-tuning Qwen2.5-VL-7B on 3,000 documents beat every zero-shot frontier model on templated extraction, F1 0.985 against Claude Sonnet 4.5 at 0.857 (Patel et al., arXiv 2609.15706, Sep 2026. https://arxiv.org/abs/2609.15706). Self-hosted on one AWS g5.xlarge at $1.006/hr: $734 a month fixed, near zero per report. Breakeven against Opus at $0.19 a report: about 3,900 reports a month. Below that, stay on the API.
3. Jev (TypeSafe AI) for the yes/no and scoring decisions: scan pass or fail, severity of each finding, whether a finding is a plan gap. $0.042 per million input tokens, output free. Launched 15 Sep 2026. Independent benchmark: median 329 ms against 1,598 ms for a frontier model, 5x faster, 25x cheaper, 98.5% accuracy on a 1,357-decision set (Entagl Research, Sep 2026. https://www.entagl.com/blog/typesafe-jev-benchmark-ai-decision-models). Jev cannot read images or write text, so it cannot replace the TGS reader or the report writer. It replaces the decisions between them. Per report: under $0.001.

Optimised total: about US$0.07 a report with the hosted open model and US SUMO, or A$0.10. The SUMO run becomes the biggest cost.

### Side by side

| | Existing system | Barrier Brain MVP | Barrier Brain optimised |
|---|---|---|---|
| Cost to model one closure | $30,000 to $200,000 (micro-sim), so short jobs get $0 of modelling | A$0.50 | A$0.10 |
| Time to a result | weeks | under 1 hour | under 1 hour, decisions in 0.3 s |
| Site check | none before setup, first-week observation after | phone scan, code plus AI | same, fine-tuned model |
| Every closure in Melbourne near a signal, a year (1,190) | not done | A$595 | A$119 |

The point for the judges: today the choice is $30,000 or nothing, so it is nothing. We make it 50 cents, so it can be every site.

### At scale

Our estimate of active sites, labelled as such: 16,100 traffic controllers, about two per site, gives about 8,000 traffic-controlled sites on a working day in Australia. If every one ran a report at the start and one revision, 16,000 reports a day is about A$8,000 a day on the MVP stack or A$1,600 optimised. Against $1.65 billion a year of roadworks congestion and $320 million a year of crashes.

## 4. How fast can it go real

What already runs: the app on Vercel, Claude through the API, scan registration in the browser, the lookup model in TypeScript, SUMO fitted to 52 SCATS sites with real signal timings, council pedestrian sensors. Photogrammetry is a free app anyone has.

Three steps to a first real site, from the pre-screening PDF's "what's left":
1. Run SUMO in the cloud from the app instead of a laptop. One CPU instance, priced above.
2. Live RADAR and SCATS feeds instead of the downloaded copies. Both are published open data.
3. A pilot with one accredited traffic management company on one arterial road, with RPM Hire's equipment list as the inventory.

No new hardware, no new data collection, no new regulation. Every input already exists.

## 5. Gaps and what not to claim

- No Australian audit publishes how often a site set-up differs from its approved TGS. Use the tradie's quote and WorkSafe's inspection findings, not a percentage.
- No Australian figure for roadworks' share of congestion. The 10% is US FHWA. Say so.
- No published count of roadworks or permits a year in Victoria, NSW or nationally. Use our RADAR count for Melbourne and label the national figure an estimate.
- The 15% crash reduction, 5% delay reduction and 20% revision rate are our assumptions. Austroads' own program was justified on a 5% crash cut, which is the best anchor. Garber's 25 to 30% of crashes in the placement areas is the grounds for 15%.
- The Victorian road occupation charge of $1,200 to $1,865 per lane per week is the 2018 trial rate (The Urban Developer, 29 May 2018). A search snippet gives today's rate as $173 to $252 per lane per day, but the Transport Victoria page could not be fetched to confirm it.
- Jev's headline claims (200x faster, 400x cheaper) are TypeSafe's own. Use the independent 5x and 25x from Entagl.
- The app calls Sonnet 5.5 in test and Opus 5.5 live. Costs above use Opus.
