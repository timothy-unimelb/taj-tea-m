# Barrier Brain prototype verification

final result: passed

## Comparison target and evidence

- Source visual truth: `public/assets/barrier-brain-reference.png`, the user-supplied final nine-screen board, 1448 x 1086 pixels.
- Production preview: `http://127.0.0.1:3000/`.
- Browser: Codex in-app browser. Primary CSS viewport 393 x 852. Additional checks at 375 x 812, 430 x 852 and 1024 x 900.
- Screenshots: `artifacts/qa/projects-393.png`, `tgs-upload-393.png`, `report-393-top.png`, `report-393-bottom.png`, `pdf-preview-393.png`.
- Projects and upload screenshots are 393 x 852 pixels. The browser capture returned 378 x 819 for scrollable report/document views; the CSS viewport remained 393 x 852, with a 15 px desktop scrollbar. The renderer scales its scrollable screenshot output by approximately 0.962. This capture-scale difference is not an application overflow.
- Compared the source board, report top and lower sections, and upload screenshot together in one visual-review input. Reference device bezels and status bars were excluded from the comparison. The user's requested full browser layout intentionally does not reproduce them.
- The board's report is a wider composite panel rather than a literal 393 px screenshot. Report rows reflow vertically at the requested phone width so text stays readable. Content order, decision state, section hierarchy and map are preserved.
- Focused review: decision card, metric severities and values in `report-393-top.png`; aerial overlays, legend and action rows in `report-393-bottom.png`; upload spacing and bottom action in `tgs-upload-393.png`.

## Findings and comparison history

- Resolved P2: an imposed minimum height changed the reference aerial crop's coordinate system. Removed it and retained the source artwork's aspect ratio. Post-fix production screenshots show the full road, orange work zone, blue arrows, yellow pedestrian route, green scan points and numbered callouts.
- Resolved P2: the skip link initially conflicted with hash-based screen navigation. It now focuses the screen heading without changing the current view.
- Resolved P2: checklist screen-reader labels described TGS findings as captured scan areas. TGS lists now announce identified items; scan lists retain captured/incomplete labels.
- Resolved P3: Tailwind's reset hid document finding bullets. Restored explicit disc list styling.
- Final visual review: no outstanding P0/P1/P2 findings. The lower resolution of supplied thumbnail/plan/LiDAR artwork remains a source limitation, not substituted stock imagery.

## Required fidelity surfaces

- Typography: existing system sans-serif retained. Bold compact headings, body hierarchy, labels and line wrapping inspected at target widths. Long report content scrolls instead of being scaled into unreadable rows.
- Layout rhythm: 20 px page padding, consistent section gaps, restrained rounded cards, 48 px primary buttons, bottom actions on short workflow screens. Desktop app is centred at 393 px. No horizontal document overflow at 375, 393 or 430 px.
- Colours: off-white background, green primary, sage checks, amber review card, red incomplete/high-impact states. Status labels and icons accompany colours. Contrast ratios checked: primary white/green 6.66:1, body 15.64:1, muted text 5.76:1, amber 6.09:1, red 6.15:1, low-impact green 7.45:1, focus colour 5.87:1.
- Images: artwork is selected from the exact supplied board and delivered through Next image optimisation. No rasterised UI is used. The user-authorised temporary SVG logo follows the triangular reference. Phosphor icons provide actual line icons.
- Copy: locked titles, descriptions, findings, metrics, recommendations and disclaimer retained. Project copy-check completed with no banned copy matches. Sample-data note identifies mock results. Structured metrics/severity and explanatory copy have separate provenance fields.

## Interaction verification

- New assessment resets the demo and opens the preselected TGS file.
- Search filters projects and shows an empty state.
- Removing the TGS disables Analyse TGS. Unsupported file type is rejected with an accessible error. Selecting a valid PNG restores the file row and enabled analysis action.
- TGS processing progresses and opens the complete state.
- External scan upload opens the check; the first demo scan produces four of five captured areas.
- Incomplete scan has no Continue control. Missing-area dialog shows the highlighted intersection; closing returns focus to its trigger.
- Additional scan progresses to five of five captured areas.
- Report generation advances through all five items and automatically opens the report.
- All five report tabs filter correctly. Arrow keys navigate tabs.
- Both recommendations expand to reveal Impact, Why it matters, Evidence used and Recommended action.
- Share action invoked without runtime error. Actual OS-native share completion was not performed; native sharing and clipboard/manual-link fallback remain browser-dependent.
- Export PDF opens a document preview with findings, metrics, site overview, actions and disclaimer. Back returns to the report. Print/Save PDF is wired to browser printing; the OS print dialog was not driven.
- UI Back and native browser Back work. Hash report links load directly. New assessment always restarts the demo.
- Report controls checked for minimum 44 x 44 px targets at 375 px. Visible focus, native dialog semantics, progress live regions, alt text and reduced-motion CSS implemented.
- Browser console checked in development and production: no warning/error entries observed.

## Build verification

- `npm run build`: passed, including TypeScript and static prerender.
- `npm run lint`: passed with no warnings or errors.
- `git diff --check`: passed. Git reports its existing LF-to-CRLF policy for the lockfile.
- Started the production server on port 3000 and verified Projects, Report and Export preview in the browser.

## Follow-up limitations

- TGS interpretation, scan completeness and quantitative results are demo fixtures; the existing Python model and live AI services are not connected.
- Uploaded files stay in the browser. Additional scan is intentionally simulated.
- Native iPhone Safari, VoiceOver, OS sharing and final saved PDF output were not device-tested. This is not a full WCAG conformance audit.
- Only the supplied board is available for several images. Higher-resolution originals would improve their enlarged appearance.
- A localhost share link is local to this machine until the app is deployed.

## Implementation checklist

- [x] Preserve Next.js, npm, Tailwind and the single data boundary.
- [x] Complete the locked mobile workflow and reusable report.
- [x] Compare the source and browser renders; repair substantive issues.
- [x] Test core interactions, responsive widths, build and lint.
- [x] Retain the running production preview and evidence files.
