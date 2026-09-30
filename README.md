# Barrier Brain

Team taj tea-m, FEIT Hackathon 2026. RPM Hire problem statement.

Barrier Brain is a mobile web app for traffic management planners. The planner uploads a traffic guidance scheme (TGS). Claude reads it and lists the places to scan on site. After a LiDAR scan, the app estimates the knock-on effects on traffic, pedestrians and public transport before any equipment goes out.

What is real and what is still demo data: **PLAN.md, "Where things stand"**.

## Run locally

```bash
npm install
vercel env pull .env.local   # Vercel AI Gateway login token, needed for real TGS analysis
npm run dev
```

Then open http://localhost:3000. The rest of the demo works without `.env.local`: the demo TGS uses a saved analysis and the impact models run on the server without keys.

Optional settings in `.env.local`:

| Variable | What it does |
|---|---|
| `IMPACT_MODEL` | `mvm` (default: lookup model everywhere), `sumo` (SUMO for the Swanston sample, the lookup model elsewhere) or `http` |
| `IMPACT_MODEL_URL` | With `IMPACT_MODEL=http`, a service that takes an ImpactRequest and returns an ImpactResult |

`npm run lint` and `npm run build` must pass before pushing.

## Demo walkthrough

1. **New assessment**, then **Use demo TGS**, then **Analyse TGS**. This loads the saved Claude analysis of the Swanston St sample, instantly and for free. Choosing your own PDF, PNG or JPG sends it to Claude (about 20 s, about 3.5 cents).
2. **Continue to site scan**, **Use demo site scan**, **Check scan completeness**. The scan check is scripted: the first scan is incomplete, then **Upload additional scan** completes it.
3. **Generate impact report**. The impact model runs on the server. Try the category tabs, open **How this was estimated**, then **Export PDF**.

Jump straight to the report with `#report/swanston-street`.

## Where things live

| Path | What it is |
|---|---|
| `app/api/analyse-tgs/route.ts` | Sends the TGS to Claude through Vercel AI Gateway |
| `prompts/tgs-analysis.md` | The prompt Claude gets for a TGS. Edit it here |
| `lib/tgs-analysis.ts` | The JSON shape Claude must return |
| `app/api/impact/route.ts`, `lib/impact/` | Impact models, the model switch and the severity rule |
| `model/IMPACT_CONTRACT.md` | How to plug in a new impact model |
| `model/mvm/` | Tamara's lookup model in Python. `lib/impact/models/mvm-core.ts` is the TypeScript port |
| `model/sumo/` | SUMO simulation of the Swanston closure. Read its README before running it |
| `lib/data.ts` | The one place screens get data from |
| `data/mock/` | Demo data, the sample TGS and its saved analysis |
| `components/` | Raina's screens. The design is locked (DESIGN.md) |

## Project docs

- **BRIEF.md**: what we are building and why, decisions log.
- **PLAN.md**: build steps, their state, and where things stand.
- **STATUS.md**: who is working on what.
- **DESIGN.md**: the locked design and screen flow.
- **THIRD_PARTY.md**: every outside library, dataset and tool. Required by the competition.
- **CLAUDE.md**: rules for Claude sessions in this repo.
