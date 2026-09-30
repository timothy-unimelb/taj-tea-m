# Pitch checklist

Changes to make before the Thursday 1 Oct pitch. The demo runs live on stage, so the flow must move fast and the report must make the pitch's points: time, safety and efficiency. Tim and Joel are building these. Tick items off as they land and say where.

The pre-screening PDF the judges have read is at `artifacts/submission/pre-screening.pdf`.

## Upload site scan screen

- [x] Allow more than one scan. Button and heading say "Upload scans". (Joel, branch `joel`)
- [ ] Code that stitches several scans into one site scan, as part of the flow. (Tamara. Hook in `lib/scan/stitch.ts`; a GPS join with height levelling stands in until then.)
- [x] The site scan button says .zip but that is not what it takes. Fix the copy. (Joel: PLY and LAS only, demo scan is .las)
- [x] External scan evidence (mobile scan capture, point cloud export, map export): show only after a scan is uploaded. (Joel)
- [x] "Upload additional scan" goes back to the upload screen. For the demo, move through the flow faster. No trip back. (Joel: opens the file picker on the incomplete screen, then checks again)

## Impact report

Lead with time, safety and efficiency: hours of delay across the city, pedestrian safety, which streets take the detour, queue length. One public transport point. It is in the problem statement so it stays, but it matters less than the others.

- [ ] Each mode shows its own detail. It does not yet.
- [x] Site overview image is distorted. Fix. (Joel: artwork shown at its own shape)

Traffic
- [x] Hours of delay within an x km radius. (Tim: for the test TGS, from SUMO. About 16 vehicle-hours within about 600 m. Other sites show the lookup's delay with no radius.)
- [x] Which streets take the detour, and whether each can carry the extra volume. (Tim: for the test TGS, from SUMO. Cars an hour on Faraday St, Cardigan St and Grattan St against a lane's capacity, on the Traffic tab.)
- [x] Queue length. (Tim: for the test TGS, from SUMO. Other sites show the lookup's queue.)
- [x] Is the detour safe. (Tim: for the demo TGS, saved report point. Not as drawn: VMS 1 and 2 stand past the Faraday St turn, and Faraday St westbound becomes a dead end.)

Pedestrians
- [x] Are they at risk, given the detour. (Tim: demo TGS. Detour turns across zebra crossings with no signals at Faraday St and Cardigan St.)
- [x] How much further they walk. (Tim: demo TGS. None, the footpath stays open.)
- [x] A third point Claude picks from the data set or nearby information. (Tim: demo TGS. Lunchtime crowding from the council sensor: 708 an hour needs the full 1.5 m.)
- [x] Pedestrian safety follows the council's rules. Councils have logic for how crowded a footpath gets before people step onto the road. Pass that rule to the agent when it analyses the scan for the report. (Joel: rule in `prompts/site-check.md`, counts from the nearest council sensors via `lib/pedestrians.ts`. See BRIEF.md decisions.)

Public transport
- [x] Can buses and trams still run as planned. (Tim: demo TGS. Trams yes, bus 546 no.)
- [x] Are bus and tram stops accessible. (Tim: demo TGS. Yes, Melbourne University tram stop and its crossing stay open.)
- [x] Is a PTV permit needed (usually within 20 m of a tram stop). (Tim: demo TGS. Yes, the lane closure and VMS 2 are within 20 m of the platform.)

Site safety
- [x] Three valid, useful, actionable points. Claude picks them from the data sources, the problem statement, our solution and the demo TGS, drawing on the traffic, pedestrian and public transport points. Keep the screen light. Possible point: is any part of the site accidentally exposed. (Tim: demo TGS. Move VMS 1 and 2 north of Faraday St; hold people while plant crosses; check the tram clearance at set-out. All report points for the demo TGS are written in advance in `data/mock/reports/`, other TGSs do not get them yet.)

Recommended before deployment
- [x] Matches the points in the report. At most 5. (Joel: each recommendation names its report point, most severe point first, one per point before any second, max 5, same list in the PDF)

## Export PDF

- [ ] More detail. The reader is a project planner who reads graphs and wants detail. Include charts and relevant data visualisations.
- [ ] Everything in "Recommended before deployment" is in the PDF.

## Last screen

- [x] The Back button becomes a Close button that returns to the first screen. (Joel: on the report; the PDF preview keeps Back to the report)

## From the pre-screening PDF's "what's left"

- [ ] Stitch the working pieces into one end-to-end flow on Vercel.
- [ ] Run the model's inference in the cloud from the app, not on our laptops.
- [ ] Turn the point cloud registration process into a script.
