---
name: copy-check
description: Check and fix text that users or judges will read, so it doesn't sound AI-written. Covers UI text, slides, README, pitch script and submission text. Use when someone says "check copy" or "copy-check", before marking a UI task done, and before submitting slides.
---

# copy-check

Scope: text a person will read. UI strings in app/ and components/, slides, README.md, pitch and submission text. Not code comments.

## Steps

1. Find the text. For UI work, check the files changed in this task: `git diff --name-only HEAD`.
2. Run the hard checks:

   ```bash
   grep -rnE $'\xe2\x80\x94|\xe2\x80\x93' app components README.md
   grep -rniE "\b(delve|leverage|seamless|seamlessly|robust|powerful|cutting-edge|game-chang|revolutioni|elevate|unlock|empower|harness|streamline|tapestry|realm|landscape|testament|beacon|cornerstone|pivotal|foster|embark|navigate the|myriad|multifaceted|holistic|synergy|supercharge|effortless|next-gen|state-of-the-art)\w*" app components README.md
   grep -rn "!" app components --include=*.tsx | grep -v "!=" | grep -v "!\w"
   ```

3. Read every string against the rules below. The greps only catch the obvious cases.
4. Report each problem as: file and line, the text, what's wrong, a rewrite. Group by file.
5. Apply the fixes if the person asks, or if you are finishing your own task.

## Rules

- Plain words. Say what the thing does.
- Short sentences. One idea each.
- No em dashes or en dashes as punctuation. Use a full stop or a comma.
- No exclamation marks. No rhetorical questions.
- None of the banned words in the grep above.
- None of these patterns:
  - "It's not X, it's Y" and "Not just X, but Y"
  - Lists of three adjectives, like "fast, simple and secure"
  - "Here's the thing", "Let's dive in", "Imagine a world where", "Say goodbye to", "Unlock the power of"
  - "Whether you're a X or a Y"
  - "In today's fast-paced world", "In the realm of", "It's worth noting that", "Furthermore", "Moreover"
  - "Great question", "Certainly", "Absolutely"
  - Closing summaries like "In summary" or "Ultimately"
- UI text:
  - Buttons say what happens: "Check eligibility", not "Get started" or "Submit".
  - Labels are nouns.
  - Errors say what happened and what to do next.
  - No "AI-powered", "smart" or "magic".
- Numbers are real, or clearly marked as sample data.

## Example

Before: "Seamlessly unlock powerful insights with our AI-powered dashboard!"

After: "See which permits are overdue and who needs to act."
