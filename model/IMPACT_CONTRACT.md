# Impact model contract

The app does not depend on any one traffic model. Every model takes the same input (an **ImpactRequest**) and returns the same output (an **ImpactResult**). The report reads only the ImpactResult. So a new model plugs in without touching the report.

The TypeScript types are in `lib/impact/types.ts`. This file explains them. If the two disagree, the types win.

## How the app picks a model

One setting, the `IMPACT_MODEL` environment variable (in `.env.local` or Vercel):

| Value | Model | Runs |
|---|---|---|
| `sumo` | SUMO traffic simulation (`model/sumo/`) | Precomputed, Swanston St sample only |
| `mvm` (default) | Tamara's past-closures lookup plus hourly queue, ported to TypeScript (`lib/impact/models/mvm.ts`) | Live, any site |
| `http` | Any service at `IMPACT_MODEL_URL` | Live, whatever the service covers |

If the chosen model can't cover the site, or fails, the app uses `mvm` instead and says so in the report's assumptions. So with `sumo` the Swanston sample shows SUMO and every other site shows `mvm`. `mvm` is the default. Note that it assumes half of the signal site's traffic uses the closed street, which overstates streets with little car access such as the Swanston block.

## Three ways to plug in a new model

1. **An outside service.** Accept `POST` with an ImpactRequest as JSON. Answer with an ImpactResult as JSON. Then set `IMPACT_MODEL=http` and `IMPACT_MODEL_URL=https://...`. Any language works, such as a Python function on Vercel or a small FastAPI app.
2. **A saved result.** Write an ImpactResult JSON file to `data/impact/`. Register it in `lib/impact/models/precomputed.ts` with the site it covers. Good for slow models such as simulations.
3. **TypeScript in the app.** Add a file in `lib/impact/models/` that exports `estimate(request): Promise<ImpactResult>`, and add it to the switch in `lib/impact/index.ts`.

## ImpactRequest (input)

Built from Claude's TGS analysis plus traffic data (`lib/impact/request.ts`).

```json
{
  "site": {
    "street": "Swanston Street",
    "extent": "Between La Trobe Street and Little La Trobe Street",
    "area": "Melbourne CBD",
    "lat": -37.80959, "lon": 144.96383,
    "scats_site_no": 2921,
    "scats_site_name": "SWANSTON/LATROBE",
    "daily_volume": 46939,
    "tram_route": true
  },
  "closure_type": "road closed",
  "work_hours": { "text": "Mon 7am-10pm", "days": "Monday", "start_hour": 7, "end_hour": 22 },
  "lanes_per_direction": 0,
  "lanes_open": 0,
  "direction_closed": true,
  "detour": "Via Elizabeth St and Little La Trobe St",
  "pedestrian_management": ["Southbound pedestrians walk on road while traffic controllers hold traffic"]
}
```

- `closure_type` is one of `road closed`, `lanes closed`, `footpath only`, `ramp closed`, `unspecified`.
- `daily_volume` is the average weekday count at the nearest SCATS signal site, all approaches together. It is found by matching the street and a cross street to the site name. `null` if nothing matched.
- `end_hour` below `start_hour` means overnight works. Either can be `null` if the plan doesn't show hours.
- `lanes_per_direction` is 0 when the plan doesn't show it.
- `direction_closed` is true when no car lane stays open in the affected direction, including every `road closed`. Then `lanes_open` is 0. When it is false, `lanes_open` 0 means the plan doesn't show it.
- `tram_route` comes from a short hand-entered list of tram streets. It should come from PTV GTFS later.

## ImpactResult (output)

```json
{
  "model": "sumo",
  "method": "SUMO traffic simulation",
  "label": "Early result",
  "provenance": "precomputed",
  "confidence": "low",
  "confidence_note": "One sentence on why.",
  "period": "Monday 7am to 10pm",
  "recommended_window": { "window": "Night, 8pm to 5am", "reason": "..." },
  "modes": {
    "cars": {
      "status": "modelled",
      "delay": { "low": 120, "typical": 180, "high": 260, "unit": "vehicle-hours" },
      "max_queue": { "low": 40, "typical": 90, "high": 150, "unit": "m" },
      "forced_diversions": { "low": 3000, "typical": 3500, "high": 4100, "unit": "vehicles" },
      "detour": { "low": 300, "typical": 420, "high": 600, "unit": "m" },
      "summary": "One plain sentence for the report."
    },
    "public_transport": { "status": "not modelled", "summary": "This model covers road traffic only." },
    "pedestrians": { "status": "not modelled", "summary": "..." },
    "trucks": { "status": "not modelled", "summary": "..." }
  },
  "assumptions": ["Short plain sentences. One assumption each."],
  "visual": {
    "src": "/assets/sumo-swanston-5pm.gif",
    "width": 648,
    "height": 374,
    "alt": "What a screen reader says instead of the picture.",
    "caption": "One or two sentences on what the picture shows.",
    "legend": [{ "label": "Stopped car", "colour": "#d73027" }]
  },
  "generated_at": "2026-09-30T04:00:00Z"
}
```

(The numbers above only show the shape. They are not results.)

Rules:

- **Ranges, not single numbers.** Every metric is `{ low, typical, high, unit }`. Use your model's spread, such as P10, P50 and P90, or several random seeds.
- **Units.** Delay in vehicle-hours over the works period. Queue in metres. Diversions in vehicles. Detour in extra metres per diverted trip. Anything else goes in `other: [{ label, range }]`.
- **Never invent a mode.** If your model doesn't cover a mode, set `status: "not modelled"`, leave the metrics out and say so in `summary`.
- **Say how it was made.** `method` and `label` show on the report. `provenance` is `live`, `precomputed` or `fixture`. List every assumption a traffic engineer would ask about.
- **Leave out `severity`, `severity_reason` and `overall`.** The app rates every model with the same rule, below.
- **Plain text.** Short sentences. No em dashes.

## Severity rule

In `lib/impact/severity.ts`. Applied to every model's result.

1. A modelled mode is rated on the high end of each range (the worst case):
   - **High:** forced diversions of 1,000 vehicles or more, or a queue of 250 m or more, or delay of 200 vehicle-hours or more.
   - **Moderate:** forced diversions of 100 or more, or a queue of 50 m or more, or delay of 20 vehicle-hours or more.
   - **Low:** below all of those.
   - Pedestrians: a detour of 100 m or more is High, 30 m or more is Moderate.
   - Trams and buses: any diverted service is High.
2. A mode the model doesn't cover is **Review required** when the plan touches it: a tram street, pedestrians moved off the footpath, or trucks on a detour when the road is closed. Otherwise it is **Not modelled**. It never gets a made-up rating.
3. **Overall** is the highest mode rating. Review required counts as Moderate.

Why these limits: 250 m is about one CBD block, so a queue that long blocks the next intersection. The diversion and delay limits are a first cut by the team. Check them with RPM Hire and Tamara.
