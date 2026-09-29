# Third-party material

The competition requires a list of all third-party material and APIs, including anything purchased.

| Name | Type | What we use it for | Licence or terms | Paid? |
|---|---|---|---|---|
| Next.js | Library | App framework | MIT | No |
| React | Library | UI rendering | MIT | No |
| Tailwind CSS | Library | Styling | MIT | No |
| Vercel | Hosting | Deploys the app | Vercel terms | No |
| Vercel AI Gateway | API | Routes the app's Claude calls | Vercel terms | Usage-based |
| @vercel/oidc | Library | Gets the Vercel login token the AI Gateway calls use | Apache-2.0 | No |
| Claude API (Anthropic) | API | Reads the uploaded TGS and lists scan points, via Vercel AI Gateway | Anthropic terms | Usage-based |
| Phosphor Icons | Icon library | Consistent line icons and status symbols in the frontend | MIT | No |
| User-supplied Barrier Brain UI reference board | Design and image source | Visual source; original street, LiDAR, plan and aerial artwork reused in the prototype | Supplied by the project user; underlying asset provenance not provided | No purchase by this implementation |
| OpenAI Codex | AI tool | Frontend implementation and verification | OpenAI terms | User account |
| Claude Code | AI tool | Writing code | Anthropic terms | [fill in] |
| RADAR roadworks (RADAR_Curated_Prod_roadworks) | Dataset | Past Melbourne closures the impact model learns from. `model/` | Dept of Infrastructure (DITRDCSA), National Freight Data Hub. Licence not confirmed, check before submission | No |
| Traffic Signal Volume Data (SCATS) | Dataset | Traffic counts before and during past closures. `model/` | DTP, CC-BY 4.0 | No |
| Traffic Signal Volume Data (SCATS), per detector | Dataset | Car counts per junction approach for the SUMO simulation, August 2026. `model/sumo/` | DTP, CC-BY 4.0 | No |
| Traffic Signal Configuration Data Sheets | Dataset | Which SCATS detector counts cars on which approach, at 9 CBD junctions. `model/sumo/detector_approaches.json` | DTP, CC-BY 4.0 | No |
| Traffic Lights (SCATS site locations) | Dataset | Locations of signal sites near each closure. `model/` | DTP, CC-BY 4.0 | No |
| Victoria Traffic Count Locations (AADT) | Dataset | Daily traffic input for the queue calculation. `model/` | DTP, CC-BY 4.0 | No |
| DuckDB | Library | Builds the impact model tables. `model/` | MIT | No |
| pandas | Library | Runs impact model predictions. `model/` | BSD 3-Clause | No |
| Eclipse SUMO | Tool | Traffic simulation of the Swanston St closure. `model/sumo/` | EPL-2.0 | No |
| OpenStreetMap data | Dataset | Street network for the SUMO simulation, via the Overpass API. `model/sumo/` | ODbL, © OpenStreetMap contributors | No |
| pyproj | Library | Map coordinate conversion for the SUMO scripts. `model/sumo/` | MIT | No |
| matplotlib | Library | Slide image of the SUMO result. `model/sumo/` | Matplotlib licence (PSF-based) | No |
| jiti | Tool | Runs the check that the TypeScript port of the impact model matches the Python. `model/check_ts_port.ts` | MIT | No |
| Sample TGS (Swanston St closure) | Image | Mock TGS upload and shape of mock data. `data/mock/tgs/` | Invarion sample drawing. Licence not confirmed, check before submission | No |
