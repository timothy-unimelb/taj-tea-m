@AGENTS.md

# taj tea-m

## What this is

[One or two lines: the problem, who it's for, and the one workflow. Update this whenever the idea changes.]

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

1. Read it at the start of every session.
2. Before starting a task, add it under "Now" in the section of the person running this session.
3. Update that line when something changes: a decision, a blocker, a partial result.
4. When the task is done, move it to "Done" with one line on what changed and where.
5. Push STATUS.md on its own after each update:
   `git pull --rebase && git add STATUS.md && git commit -m "status: <short note>" && git push`
6. When asked "what's happening?", answer from STATUS.md and `git log --oneline -15`. Five lines or fewer.

Only edit your own person's section. Anyone can edit "Links".

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
