# Test data

For testing the real TGS upload and real scans. None of this is a real plan or a real scan.

| File | What it is |
|---|---|
| `swanston-smac-lane-closure.jpg` | Test TGS in the same layout as the sample TGS: southbound kerbside lane closed on Swanston St opposite the Sidney Myer Asia Centre, work area 22 to 60 m north of Grattan St (where the team's site scan was taken), detour via Faraday St, Cardigan St and Grattan St. Aerial from Vicmap Basemap, street positions from OpenStreetMap. Upload it on the TGS screen (sends it to Claude). |
| `smac-entry-footpath.ply` | Synthetic scan of the footpath outside the SMAC entry. A planter and a bin leave about 1.4 m clear. |
| `grattan-closure-start.ply` | Synthetic scan at the Grattan St end. Clear footpath, one signal pole. |
| `footpath-only-no-kerb.ply` | Synthetic scan that misses the kerb. It should fail the scan check. |

Remake them with `node data/test/make-smac-tgs.mjs` and `node data/test/make-smac-scans.mjs`.

`merge-las.mjs` joins georeferenced LAS scans into one site scan: `node data/test/merge-las.mjs out.las in1.las in2.las ...`. The team's real Scaniverse scans of Swanston St near Grattan St are kept outside the repo; four of them merged make one 45 m site scan.
