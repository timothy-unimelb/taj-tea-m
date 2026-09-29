@AGENTS.md

# Barrier Brain (team taj tea-m)

## What this is

Barrier Brain is a mobile web app for traffic management planners. The planner uploads a traffic guidance scheme (TGS) and LiDAR scans of the street, and AI agents check the plan against the real street and report the knock-on effects on pedestrians, buses and trams, cars and trucks before any equipment goes out.

Built for the RPM Hire problem statement at the UniMelb FEIT Hackathon 2026. Read BRIEF.md for the full brief, components, terms and open questions. Update both when the idea changes.

- Mobile first. Lay every screen out for a phone. It is a Next.js app on Vercel, not a native app.
- The impact model and scan measurement are mocked for the Wednesday demo. Mock data goes in `data/mock/`. A sample TGS is in `data/mock/tgs/`.
- Agent calls run on the server. Keys stay in env vars.

This is a hackathon build. The idea will change. Build to what is written here now, and keep the code easy to change.

It is an app for one workflow, not a marketing site. No landing page, hero section, feature grid, pricing, testimonials or sign-up flow unless someone asks. The first screen is step one of the workflow.

## Do what was asked, nothing more

- Build the task you were given. Don't add features, screens, settings or options nobody asked for.
- Don't redesign, restyle, rename or refactor anything outside the task.
- Don't add infrastructure unless asked: no auth, database, test framework, state library or CI.
- If the request is unclear, ask one short question. If you have to proceed, pick the simplest option and note the assumption in STATUS.md.
- Prefer small changes that are easy to undo.

## STATUS.md

STATUS.md tracks what each Claude session is working on. Anyone can ask "what's happening?" and get a straight answer.

1. Read it, BRIEF.md and PLAN.md at the start of every session. PLAN.md holds the build steps and their state. Update it when a step changes.
2. Before starting a task, add it under "Now" in the section of the person running this session.
3. Update that line when something changes: a decision, a blocker, a partial result.
4. When the task is done, move it to "Done" with one line on what changed and where.
5. Push STATUS.md on its own after each update:
   `git pull --rebase && git add STATUS.md && git commit -m "status: <short note>" && git push`
6. When asked "what's happening?", answer from STATUS.md and `git log --oneline -15`. Five lines or fewer.

Only edit your own person's section. Anyone can edit "Links". If the person running the session has no section, add one.

## BRIEF.md

BRIEF.md is the shared record of what we are building and why. It holds the brief, the approach for each part, open questions and a decisions log. Anyone can edit it.

1. Read it at the start of every session, with STATUS.md.
2. Whenever the person you are working with makes a product decision, answers an open question or changes the idea, record it before you finish the task:
   - add a dated line under "Decisions" with their name,
   - update the section it affects,
   - delete the answered question from "Open questions".
3. When you hit a question only the team can answer, add it under "Open questions".
4. If the change affects the one-paragraph summary at the top of this file, update that too. If it changes the screens, update the Flow in DESIGN.md.
5. Commit BRIEF.md with the work it relates to. If there is no other work, push it on its own:
   `git pull --rebase && git add BRIEF.md && git commit -m "brief: <short note>" && git push`

Don't record implementation details here. Those live in the code and git history.

## How to explain things

- Short, plain sentences. One idea per sentence.
- Start with the answer or with what changed. Then why. Then how, if needed.
- Each sentence should follow from the one before it.
- No jargon. If a technical term is unavoidable, say what it means the first time.
- Be brief. Only write a long reply when the explanation truly needs it.
- No em dashes.

## Build rules

- Start with mock data in `data/mock/`. All screens read data through `lib/data.ts`, so switching to real data changes one file.
- Mock data must look real for the problem. No "John Doe", "Acme" or lorem ipsum.
- Get a screen working end to end before polishing it.
- Keys live in Vercel env vars and `.env.local`. Never commit them.
- When you add any outside library, API, dataset, font, icon set or image, add it to THIRD_PARTY.md in the same commit. The competition requires this list.
- Main must always build. If you changed dependencies or config, run `npm run build` before pushing.

## Design

Follow DESIGN.md.

If DESIGN.md says the design is not set, build plain structure only: system font stack, black text on white, one grey for borders, no accent colour, no decoration. Do not invent a visual style.

Always avoid everything in the "Never" list in DESIGN.md.

## Text in the app

Text a user or judge will read follows the copy-check rules. Run /copy-check before marking any UI task done.

## Skills

Project skills: /copy-check and /commit-push.

Optional. Mention these when they would help, but don't install or use them unless asked:

- Frontend Slides, for slides or a pitch deck: https://github.com/zarazhangrui/frontend-slides
- iOS Simulator skill, only if we build a native iOS app: https://github.com/conorluddy/ios-simulator-skill

Do not use Anthropic's frontend-design skill in this repo.
