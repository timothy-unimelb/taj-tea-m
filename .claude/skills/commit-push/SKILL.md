---
name: commit-push
description: Secret-scan, commit and push to main safely. Use when someone says "commit", "push", "ship it", or when a task is finished.
---

# commit-push

1. Check the state:

   ```bash
   git status --short
   ```

   Make sure STATUS.md is up to date for this task. If the change adds any outside library, API, dataset, font or asset, make sure THIRD_PARTY.md lists it.

2. If package.json or any config file changed, run `npm run build`. If it fails, stop and explain the error in plain words.

3. Stage everything. Never stage .env files.

   ```bash
   git add -A
   ```

4. Hard gate. Scan the staged changes for secrets:

   ```bash
   python3 .claude/skills/commit-push/scripts/secret-scan.py
   ```

   If it exits with 1, stop. Show the findings, unstage the flagged files with `git reset <file>`, and do not commit. Only continue if the person confirms each finding is a false positive.

5. Commit with a short message that says what changed. Example: "Add results screen with mock data".

6. Get other people's changes first:

   ```bash
   git pull --rebase
   ```

   If the only conflict is in STATUS.md, keep both sides' lines and continue. For any other conflict, stop. Show the files, explain the conflict in plain words, and ask what to do.

7. Push. Never force-push.

   ```bash
   git push
   ```

8. Reply in one or two lines: what was pushed. Vercel deploys main automatically. Give the app URL from STATUS.md.
