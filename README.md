# Barrier Brain

Team taj tea-m, FEIT Hackathon 2026. RPM Hire problem statement.

Barrier Brain checks a planned road work zone against a LiDAR scan of the real street. It then reports the effects on pedestrians, public transport and traffic before any equipment is set up.

## Run locally

```bash
npm install
vercel env pull .env.local
npm run dev
```

Then open http://localhost:3000.

## Barrier Brain frontend demo

Run `npm ci` and `npm run dev`. No API keys or environment variables are needed for the prototype. `npm run build` and `npm start` run the production version.

Choose **New assessment** to reset and demo the full flow. The sample TGS is preselected. A real file can also be selected or dropped (PDF/PNG/JPG, max 20 MB). Scan selection accepts PLY/LAS/E57/ZIP; the check button uses the demo scan when none is selected. No files are transmitted.

The first scan is incomplete. View the missing intersection approach, then select **Upload additional scan** to simulate a second scan. Generate the report, try its category tabs and expandable recommendations, then open **Export PDF**. The preview includes **Print / Save PDF**. Share uses native browser sharing or copies a direct link to the same demo report. A localhost link is only available on the machine running the app.

Project progress is stored in localStorage when available. **New assessment** always restarts Swan Street. Browser back and forward follow the hash-based views. The locked report uses deterministic sample values; the Python model and AI analysis are not connected. All screen data passes through `lib/data.ts`; structured values and explanatory copy are separated in `data/mock/barrier-brain.json`.

The supplied board's artwork is selected using `ReferenceAsset` in `components/prototype-ui.tsx` and served through Next image optimisation. The small raster source limits enlargement quality. The higher-resolution Swanston Street sample in `data/mock/tgs/` remains available for later real analysis, but is not mislabelled as the locked Swan Street diagram.
