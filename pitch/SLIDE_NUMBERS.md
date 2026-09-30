# What goes on the slides, and why

A proposal for the numbers in the Thursday 1 Oct deck, matched to the slide templates in the draft (BarrierBrain_TajTea-m PPT.pdf, 33 pages). Each entry has the slide type, the words on the slide, the source, the working, and the one-line answer if a judge asks "where did that come from".

Full sources and maths: pitch/FEASIBILITY.md. Read that before the Q and A.

## The rule for every number

Every number on a slide must survive one question. So each one below is either a published figure, or a calculation from published figures with the assumptions stated. The assumptions are ours. They are reasonable, and we say so if asked. That is how every investor deck works.

## The templates and what each one is good at

| Template (page) | Good for |
|---|---|
| Photo with a stat overlay (3, 4) | One shocking number over the story image |
| Single hero number with icon (16, 17) | One figure the room must remember |
| Before and after bar with percentage (14) | A big reduction or a big gap between two counts |
| Donut ring (15) | A share of something, under 50% |
| Waffle grid of icons (19) | A share of something near 100%, or "X out of 100" |
| Timeline bar, weeks to minutes (18) | Time collapse |
| Two circles, Model B vs Our Model (28) | One cost or time against ours |
| Three nested circles (27) | Three costs or three tiers, shrinking |
| Four-number row (23) | A summary of the whole pitch in four figures |
| Three columns, headline and text (29) | Three parallel claims: lives, dollars, months, or feasibility points |
| Three stacked metrics with caption (30) | Three numbers that need a sentence each |
| Quote (12, 13, 22, 33) | Tradie, regulator, or our own closing line |

## Section by section

### 1. Hook and story (pages 3 and 4)

Page 3, the India barricade photo. No number. Let the story land.

Page 4, the collage of crashes from other countries. Add one stat overlay:

> In the US a work zone injures someone every 14 minutes and kills someone every 15 hours.

Source: US Federal Highway Administration work zone facts. https://ops.fhwa.dot.gov/program_areas/reduce-non-cong.htm and https://workzonesafety.org/work-zone-data/work-zone-fatal-crashes-and-fatalities/ (850 to 960 deaths a year, 2021 to 2024).

Why: it turns "it could happen to anyone" from a feeling into a clock.

Then the line that carries the story into the problem. Big number slide (page 16 style), a car icon:

> 71%
> of fatal work zone crashes involve speeding. Drivers don't slow down for what they can't see coming.

Source: FHWA, cited in Traffic Safety Resource Center, "71.4% of fatal work zone crashes speeding-related vs 30% of fatal crashes overall". Australia matches: 52 to 98% of vehicles speed approaching worksites (CARRS-Q, QUT, 2020. https://research.qut.edu.au/carrsq/wp-content/uploads/sites/296/2021/12/Roadworks-Safety.pdf). This is the dad story in a number. He was at the limit and still had no time.

### 2. The problem (pages 5, 20, 23, 30)

Page 5 stays as is. Then three slides that make "lives, money and time" concrete.

**Lives. Four-number row (page 23):**

> 18 · 245 · 530 · $3.2bn
> fatal crashes · serious injury crashes · minor injury crashes at Australian roadworks, every year · their cost over ten years

Source: Austroads AP-R678-22, Sep 2022, built from every state's crash data. https://austroads.gov.au/publications/temporary-traffic-management/ap-r678-22
Defence: "That's Austroads' own national figure, from the benefit-cost study for harmonising traffic management."

**The undercount. Before and after bar (page 14), repurposed:**

> 128 → 820
> Work zone crashes in Queensland over 45 months. What police recorded, and what workplace safety records held.

Source: Blackman, Debnath and Haworth, Traffic Injury Prevention, 2020. https://pubmed.ncbi.nlm.nih.gov/32154733/
Working: 820 / 128 = 6.4. Say "police see one in six".
Why: it is the "wow, I didn't know" moment, and it makes every later safety number sound conservative.

**Where crashes happen. Donut ring (page 15):**

> 1 in 4
> work zone crashes happen before the work even starts: in the warning signs and the taper. The part of the site that is only ever as good as where someone put the cones.

Source: Garber and Zhao, Virginia Transportation Research Council, 2002, 1,484 police-recorded work zone crashes. Advance warning area 8.7 to 11.3%, transition area 11.0 to 16.2%, buffer 4.5 to 6.5%. https://rosap.ntl.bts.gov/view/dot/20448/dot_20448_DS1.pdf
Working: 8.68 + 16.22 = 24.9% on interstates; 11.27 + 11.01 = 22.3% on other roads; add the buffer and it is 27 to 31%. "1 in 4" is the low end.
Why: this is the bridge to the Scan step. Placement is the part we check.

**Pedestrians. Big number (page 16 style), walking icon:**

> 2,200
> pedestrians treated in Victorian hospitals every year. The densest cluster of pedestrian crashes in the state is the Melbourne CBD, Southbank to Carlton.

Source: Victoria Walks and Monash University Accident Research Centre, Understanding Pedestrian Crashes in Victoria (hospital data 2008 to 2017; 56 pedestrian deaths a year). https://www.victoriawalks.org.au/Assets/Files/Understanding-Pedestrian-Crashes.pdf
Why: Carlton is where our demo site is. Say it: "Our demo site is Swanston Street at Grattan Street. That's inside this cluster."

**The regulator admits it. Quote slide (page 22, all caps):**

> "MOVEMENT PATTERNS OF PEDESTRIANS MUST BE OBSERVED, ESPECIALLY DURING THE FIRST WEEK, AND NECESSARY CHANGES MADE."
> Transport for NSW, Traffic Control at Work Sites, section 4.4.2

Source: https://www.transport.nsw.gov.au/system/files/media/documents/2023/traffic-control-at-work-sites.pdf
Why: the rule book says the public is the test. It sets up the closing line an hour before you say it.

### 3. The permit is longer than the job (pages 19 and 18)

This is the strongest new fact and it is ours.

**Waffle grid (page 19), 100 hourglasses, 99.6 of them filled:**

> 99.6%
> of Melbourne road closures last a week or less. The permit to run one takes three.

Source: our own dataset. 3,075 closures on 801 Melbourne streets from the RADAR roadworks feed, Feb 2024 to Sep 2026, matched to traffic signals (model/data/closure_site_hour.parquet). Median closure 1.5 days. 42% last one day, 82% three days or less, 99.6% seven days or less. Permit: Department of Transport and Planning's stated average of 15 business days for a Memorandum of Authorisation (2022 FAQ), City of Melbourne up to 15 business days, TfNSW minimum 10 working days.
Defence: "We pulled every closure in the state's roadworks feed for the last two and a half years and measured it."
Why: it explains in one picture why nobody models short jobs. Modelling costs $30,000 and takes weeks, and the job is over in two days. So the drawing is all they have.

**Timeline bar (page 18):**

> 15 business days → under 1 hour
> From a plan to knowing what it does to the street.

Source: approval times above. Our build: Claude reads the TGS in 17 s, two scans fit together in 58 s, the site check runs in 14 s, SUMO simulates the site in 10 to 30 minutes.
Note: the draft says "2 to 4 weeks, using SUMO". Keep the weeks if you want to compare with a consultant's micro-simulation, but there is no published timeline for that. The 15 business days is a government figure. Use it.

### 4. The tradie (pages 12 and 13)

Two quote slides. His words, his first name, his company, his years.

If he says nothing usable, use this one on page 13 instead:

> "Producing a traffic model ... can reduce multiple TMP revisions and the lengthy approval periods associated with those revisions."
> Main Roads Western Australia, Guidelines for Traffic Modelling, 2025

Source: https://www.mainroads.wa.gov.au/499785/globalassets/technical-commercial/working-on-roads/traffic-management/guidelines-for-traffic-modelling.pdf
Why: a road authority saying our product's value in its own words.

### 5. Solution and how it works (pages 6 to 11)

No numbers on 6 to 10. One number on the Simulate slide (page 11), since the phone is already showing it:

> Built on 3,000 real Melbourne closures and 52 signal sites, hour by hour.

Source: model/README.md and model/sumo/README.md. The deck currently says 2,700, which is the matched subset. 3,075 is the full count in the parquet. Either is fine; pick one and use it everywhere.

### 6. What it found on the demo site (pages 14 to 17)

The draft has "11,500 → 1,800 forced diversions, 84%". I could not find that figure anywhere in the repo, the model, or the SUMO output. Do not use it unless Tim can show where it came from. Replace with figures the app will show on stage:

**Hero number with truck icon (page 16), keep:**

> ~900
> drivers a day would have missed the detour. Both VMS boards stand past the Faraday Street turn.

Source: SUMO run on the demo TGS, 891 southbound drivers must leave Swanston St at Faraday St (model/sumo/output/smac/, data/impact/sumo-smac.json). The detector on the closed lane counts 888 a day, so the number is measured, not modelled. The TGS puts VMS 1 and 2 south of Faraday St, after the turn.
Defence: "The lane's own traffic counter says 888. We just read it."

**Before and after bar (page 14), the detour street:**

> 41 → 160
> cars an hour on Faraday Street once the detour is signed. Four times its normal load. It copes, at 65% of one lane. Nobody had checked.

Source: same SUMO run. Faraday St 41 to 160, Cardigan St 187 to 310, Grattan St 301 to 429 cars an hour.

**Three stacked metrics (page 30), the three things the plan missed:**

> 2 · zebra crossings the detour turns across, neither signalled
> 1 · bus route driving through the closed lane (bus 546)
> 1 · street left with no way out (Faraday St westbound)

Source: data/mock/reports/swanston-smac-report.json, PITCH_CHECKLIST.md.
Close the section: "All of this from one phone, in under an hour, before a single cone went out."

### 7. Feasibility: lives, dollars, months (pages 29, 27, 28, 23)

This is where the hook gets paid off. Three columns (page 29):

**01 Lives**

> 260 people a year are killed or seriously injured at Australian roadworks. A quarter of those crashes happen in the signs and tapers we check. Cut them by 15% and that is 40 people a year, 400 a decade. Hundreds of lives.

Working, for the Q and A:
- 18 fatal + 245 serious injury crashes a year = 263 crashes, at least 263 people (Austroads).
- 15% reduction is our assumption. Grounds: 25 to 30% of work zone crashes happen in the placement-defined areas (Garber). We check placement on every site. Preventing half of those is 12 to 15%. Austroads justified its entire national program on 5%, and that was a paperwork change, not a site check.
- 263 x 15% = 39 a year, 394 a decade.
- Police see one in six (Queensland). On the real count the figure is in the thousands.
- If asked "lives or injuries": "killed or seriously injured. Serious means hospitalised, often for weeks. We count those as lives changed."
- If asked about scale: "That's Australia. The US loses 900 people a year in work zones. Fifteen per cent of that is 135 lives a year."

**02 Dollars**

> Roadworks cause about 10% of congestion. In Melbourne that is $460 million a year. Trim it 5% and save $23 million a year. Add $48 million in crashes avoided nationally. Tens of millions a year, in one city.

Working:
- Melbourne congestion $4.6 billion (2015), $7.6 to $10.2 billion by 2030 (BITRE). https://www.bitre.gov.au/sites/default/files/is_074.pdf
- Roadworks share 10%: US FHWA. No Australian figure exists. Say "the US federal figure".
- $4.6bn x 10% = $460m. x 5% = $23m. Nationally $16.5bn x 10% x 5% = $83m.
- Crashes: $3.2bn over 10 years = $320m a year (Austroads). x 15% = $48m.
- Per site: a plan that fails on the day costs $3,500 to redraw and re-lodge, $600 to $1,500 for a crew callback, and about $12,000 if the shift is lost (Western Sydney Trades 2026, One Stop Traffic 2026). A Barrier Brain report costs 50 cents.
- The Victorian government already prices a blocked lane: $1,200 to $1,865 per lane per week under the road occupation charge (2018 trial, The Urban Developer). That is the state's own number for what one lane of congestion is worth.

**03 Months**

> Melbourne runs about 1,200 closures a year near signals. If one in five needs a revision, that is 240 restarts of a 15-day clock. 720 weeks of waiting. Fourteen years, every year, in one city.

Working:
- 3,075 closures over 31 months = 1,190 a year (our data).
- 20% revision rate: our assumption. Main Roads WA says revisions are "multiple" and approval periods "lengthy". No authority publishes a rate.
- 240 x 15 business days = 240 x 3 weeks = 720 weeks.
- If asked: "One in five is our estimate. Ask any traffic management company if it is too high."

### 8. Economics: existing vs MVP vs optimised (pages 27 and 28)

**Three nested circles (page 27), drawn to scale by area:**

> $0.19 · $0.0034 · $0.0001
> AI cost per report: frontier model today · open-weight model · Jev for the decisions

Working: per report about 9,500 tokens in, 7,500 out. Opus 5.5 at $4 in, $20 out = $0.19. Llama 3.3 70B on DeepInfra at $0.10 in, $0.32 out = $0.0034 (55 times cheaper). Jev at $0.042 per million input tokens, output free, about 2,000 tokens of decisions = $0.0001. Radius ratios are 7.4 and 5.8, so the circles fit on one slide to scale. Sources: https://platform.claude.com/docs/en/about-claude/pricing, https://deepinfra.com/pricing, https://www.entagl.com/blog/typesafe-jev-benchmark-ai-decision-models
Caption: "Same report. Three stacks. The optimised one is 1,900 times cheaper than today's."
Jev caveat if asked: "Jev can't read a drawing or write a sentence. It makes the yes/no calls in between: does this scan pass, how severe is this finding. It does that in 0.3 seconds, five times faster than a frontier model, at 25 times less." (Entagl, independent, Sep 2026.)

**Two circles (page 28), Model B vs Our Model:**

> $30,000 vs $0.50
> What it costs to simulate one closure today, and with Barrier Brain. Not to scale. It can't be.

Working: micro-simulation study $30,000 to $200,000 (Feasly, Apr 2026, https://www.feasly.com.au/guides/traffic-impact-assessment-australia-developer-guide). Barrier Brain MVP: $0.19 Claude + $0.16 SUMO on an 8 vCPU Sydney instance for 20 minutes + Vercel = about US$0.35, A$0.50.
Line: "Today the choice is thirty thousand dollars or nothing. So it's nothing. We make it fifty cents, so it can be every site."

**Three stacked metrics (page 30), at scale:**

> $0.50 · per report today, $0.10 optimised
> 1,200 · closures a year in Melbourne near signals
> $600 · to simulate every one of them for a year

Working: 1,190 x A$0.50 = A$595.

### 9. How fast can it go real (page 29 again, or page 23)

Three columns:

> 01 It runs today. Next.js on Vercel, Claude through the API, SUMO on real signal timings, scan registration in the browser. Every piece is live.
> 02 Any phone. Scaniverse does photogrammetry on iOS and Android with no LiDAR. Free for 10 minutes of capture a month. https://www.nianticspatial.com/en/pricing
> 03 Every input already exists. SCATS signal counts, the RADAR roadworks feed, council pedestrian sensors, Vicmap. All open data. No new hardware, no new survey, no new regulation.

Then one line for RPM Hire: "Three steps to a first site: SUMO in the cloud, live feeds instead of downloads, one pilot with one accredited crew and RPM Hire's inventory."

One more wow fact if there is room, hero number (page 17 style):

> 92 days → 1 day
> One construction company's intersection occupation, once Victoria started charging for blocked lanes. Occupation periods fell 75% in the trial.

Source: Premier of Victoria, 5 Mar 2020. https://www.premier.vic.gov.au/keeping-traffic-moving-across-melbourne/
Why: proof that when the cost of a closure becomes visible, behaviour changes fast. Barrier Brain makes it visible before the permit, not after the invoice.

### 10. Close (page 33, quote template)

> Right now, the public is the test.
> With Barrier Brain, they don't have to be.

## Consistency checklist before export

- Use one closure count everywhere: 3,000 (or 2,700). Not both.
- Use Opus 5.5 for the live cost. The app calls Sonnet in test.
- The 11,500 → 1,800 slide has no source. Replace it or find one.
- Label the 10% roadworks share of congestion as a US figure every time it appears.
- Label 15% and 20% as our assumptions if asked. Never on the slide.
- Run /copy-check on every slide with words.
