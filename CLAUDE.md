# Strollo — Collaboration Guide for Claude Code

This repo is worked on by multiple people, all using Claude Code with GitHub for version control. Read this file before making changes so we don't step on each other.

## Team
Evelyn Wong, Eric Tsai, Amber Jian, Seemin Masood, Kenny Ly.

## Golden rules

1. **Never commit or push directly to `main`.** All changes go through a pull request, even one-line edits. `main` is the shared source of truth — broken `main` blocks the whole team.
2. **Always pull before you start.** Run `git fetch origin && git status` at the start of every session to see if `main` has moved or if you have stale local state.
3. **One branch per task.** Branch off the latest `main`, do the work, open a PR, merge, delete the branch.
4. **Ask the user before any destructive or shared-state action.** This includes `git push --force`, `git reset --hard`, deleting branches, rewriting history, force-merging, or closing/merging someone else's PR.

## Branching workflow

```bash
git checkout main
git pull origin main
git checkout -b <yourname>/<short-task-description>
# ...do the work, commit in small logical chunks...
git push -u origin <yourname>/<short-task-description>
gh pr create
```

Branch naming: `evelyn/onboarding-flow`, `eric/fix-map-zoom`, `amber/survey-schema`, etc. The name prefix makes it obvious whose branch it is.

## Commits

- Small, focused commits. One logical change per commit.
- Imperative mood subject line under ~70 chars: `Add survey results page`, not `added stuff`.
- If a commit fixes an issue, reference it: `Fix map zoom on Safari (#42)`.
- Never amend or force-push a commit that's already on a shared branch (including your own pushed feature branch if anyone else might be reviewing it).

## Pull requests

- Open a PR as soon as you have something to discuss, even if it's a draft.
- PR description should answer: **what changed**, **why**, and **how to test it**.
- Request a review from at least one teammate before merging.
- Prefer **Squash and merge** so `main` stays a clean linear history.
- Delete the branch after merging.
- Do not merge your own PR without a review unless it's trivial (typo, doc fix) AND you've said so in the PR.

## Working with Claude Code on a shared repo

- **Use plan mode (`/plan` or shift+tab) for non-trivial work.** Get the plan right before any code is written — cheaper than redoing edits.
- **Don't let Claude push to `main` or force-push anything.** If Claude proposes either, stop and double-check.
- **Don't let Claude run `git reset --hard`, `git clean -fd`, or delete branches without your explicit OK.** These can destroy a teammate's in-progress work if your local state is stale.
- **Resolve merge conflicts manually or with Claude's help — never discard the other side's changes blindly.** When in doubt, ping the person whose code you're conflicting with.
- **Don't commit secrets.** No API keys, `.env` files, credentials, or personal access tokens. If you need to share a secret, use a password manager, not git.
- **Stage files explicitly** (`git add <file>`) instead of `git add -A` so you don't accidentally commit local scratch files, notebooks with output, or `.DS_Store`.

## When something goes wrong

- **You pushed to the wrong branch:** don't force-push. Open a PR to revert, or ask the team in chat first.
- **You see an unfamiliar branch or uncommitted file locally:** it may be your own earlier work or a teammate's. Investigate before deleting.
- **`main` is broken:** stop, tell the team, revert the offending commit via PR (`git revert <sha>`).
- **Merge conflict you don't understand:** ask the author of the conflicting change before resolving.

## Project-specific notes

- Project: Strollo, MIMS 2026 Capstone.
- Remote: `github.com/strollocapstone/Strollo`.
- Default branch: `main`.

(Add architecture notes, build commands, and test commands to this section as the project grows — Claude reads this file every session.)
