# Design language

Status: LOCKED for the frontend prototype, 29 Sep 2026. The final Barrier Brain UI reference board supplied by the user is the primary visual source: `public/assets/barrier-brain-reference.png`.

Use the supplied copy and workflow. Do not redesign or add screens without a new product request.

## Flow
Locked frontend flow, 29 Sep. Mobile browser at 393 x 852, responsive from 375 to 430 px. Centre the phone-width app on desktop. No simulated device chrome or bottom navigation.

1. **Projects.** New assessment, search and the three recent projects from the board.
2. **Upload TGS.** PDF, PNG or JPG up to 20 MB. Demo file selected. Analyse TGS.
3. **TGS analysis.** Brief progress state, then plan elements and areas requiring site verification.
4. **Upload site scan.** External photogrammetry scanning app only. PLY, LAS, E57 or ZIP upload. Check scan completeness.
5. **Incomplete scan.** Four of five areas captured. Intersection approach missing. View missing area or upload additional scan. No Continue action.
6. **Complete scan.** Five of five areas captured. Generate impact report.
7. **Generating report.** Five progressive processing steps, then automatically show the report.
8. **Site Impact Report.** Overview, Traffic, Pedestrians, Public transport and Safety tabs. Amber review-required decision, impact summary, aerial site overview and expandable recommended actions. A "How this was estimated" disclosure (method, confidence, assumptions) sits at the end of the Overview and in the PDF preview; mode tabs list the model's ranges.
9. **Export preview.** Document-style report with site image, findings, actions and planning disclaimer. Browser print/save PDF. Share is an explicit action with native share or a copy-link fallback.

Use deterministic demo analysis values. Keep explanatory copy separate. The UI supports planning, not formal traffic management approval.

## Look
- Type: existing system sans-serif, bold headings, compact readable body.
- Colour: warm white, deep green primary, sage secondary, restrained burnt orange. Amber review states, red high-impact/incomplete states. Always pair colour with words or icons.
- Spacing, corners, borders: about 8 px rhythm, 20 px page padding, 14-16 px primary card corners, subtle borders and minimal shadows.
- Buttons, inputs, tables, lists: 44 px minimum interactive targets, 48 px primary buttons, visible focus, keyboard-operable tabs, semantic disclosure rows and dialogs.
- Reference: supplied final nine-screen board. Reuse its imagery. No stock-image search or new design direction.

## Never
These make an app look AI-generated. Avoid them always.
- Pills or badges with a dot or bullet inside them, like "● Live" or "• New".
- Geist or Geist Mono fonts.
- Purple, violet or indigo gradients. Gradient text. Glowing borders.
- Sparkle icons or "AI-powered" labels to show that AI is involved.
- Frosted glass cards. Blurred colour blobs in the background.
- Landing page parts: hero sections, three-card feature grids, testimonials, pricing, "Get started" buttons.
- Emoji used as icons.
- Every element inside its own rounded card with a shadow.
- A component library's default look shipped untouched.
- Everything centred.
- Stat tiles with made-up numbers like "+42% efficiency".
