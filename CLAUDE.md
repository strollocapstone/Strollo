# Strollo — Collaboration Guide for Claude Code

This repo is worked on by multiple people, all using Claude Code with GitHub for version control. Read this file before making changes so we don't step on each other.

## Team
Evelyn Wong, Eric Tsai, Amber Jian, Seemin Masood, Kenny Ly.

## Code map

The repo is mid-refactor (see plan in `~/.claude/plans/`). Target layout — phases 1–6 will move files into these folders. Until then, new code should still go in the right *target* spot.

| Folder | What lives here | Examples |
|---|---|---|
| `src/screens/` | Top-level routes mounted from `App.js`. One file = one screen. | HomeScreen, NavigationMapScreen, RewardScreen, QuizScreen |
| `src/widgets/` | Stateful UI mounted *inside* screens; reusable across screens. | WalkCompanionWidget, ChatSheet, JourneySheet |
| `src/components/` | Leaf, presentational components. No app state, no I/O. | ConversationReel, LocationPill, PromptPills, SkeletonLine |
| `src/hooks/` | Custom React hooks. No JSX. | useGeminiPlaces, useTtsSpeak, useSpeechRecognition |
| `src/services/` | External I/O wrappers. No React. | geminiClient, geocoding, overpass, cloudTtsService |
| `src/utils/` | Pure helpers. No I/O, no React state. | geoMath, leafletHelpers, icons |

### Per-file header convention

Every `.js` file in `src/` (except CRA boilerplate `index.js`, `setupTests.js`, `reportWebVitals.js`, `App.test.js`) starts with this comment block before any code or imports:

```js
// FEATURE: <slug — see list below>
// LAST UPDATED BY: <your name>
// UPDATE DATE: <YYYY-MM-DD>
// BUILD: <merge-commit short SHA OR Vercel deployment ID>
// DEPENDS ON: <internal modules this file imports, comma-separated>
// CONSUMED BY: <internal modules that import this; or "leaf">
//
// <one-paragraph description: what's IN scope and what's OUT of scope>
```

**FEATURE slugs** (pick the closest one; create new only with team agreement):

`home-discovery` (nearby places + map pins) · `home-chat` (AI chat sheet) · `home-voice` (voice listen card) · `home-journey` (added stops + favorites) · `walk-nav` (turn-by-turn nav chrome) · `walk-conv` (in-walk conversation overlay) · `walk-tts` (nav-maneuver TTS) · `quiz` · `preferences` · `reward` · `timeline` · `intro` (incl. DevSwitch + LoadingScreen) · `shell` (App.js routing) · `shared-ui` (cross-feature presentational components) · `shared-hook` (cross-feature hooks) · `shared-service` (external I/O) · `shared-util` (pure helpers).

When you open a feature folder (e.g. `src/widgets/ChatSheet/`) you should be able to read just that folder + its declared imports and understand the entire feature without scanning the rest of the repo.

### Header maintenance — required on every push AND every PR merge

This applies to the Claude Code session running the work, not just the human reviewing it.

**Run BEFORE every `git push` to a feature branch, and AGAIN BEFORE merging the PR.** It's the same check both times — running it pre-push catches problems early; running it pre-merge catches anything that drifted while the PR was open.

For every file the PR has touched (find them with `git diff --name-only main...HEAD -- 'src/*.js'`), verify all six header fields are accurate:

1. **`LAST UPDATED BY:`** → set to the merger's name (the human running this Claude Code session). On pre-push it's whoever is pushing; on pre-merge it's whoever clicks Merge.
2. **`UPDATE DATE:`** → today's date in `YYYY-MM-DD`. Get it via `date +%Y-%m-%d`. Don't reuse the date the branch was created.
3. **`BUILD:`** → on pre-push, the latest commit's short SHA via `git rev-parse --short HEAD`. On pre-merge, update to the merge commit's short SHA *after* merging. (Vercel deployment IDs are also acceptable for `BUILD` if a deploy has already landed.)
4. **`DEPENDS ON:`** → MUST exactly match the file's actual internal imports.
   - Verify by reading the file's import lines at the top.
   - List every internal module this file imports (skip `react`, `react-leaflet`, `leaflet`, and other npm packages — only internal `./` or `../` paths). Comma-separated. Sub-paths are fine: `./mapUtils (reverseGeocode)`.
   - If imports were added/removed, update the line. Don't leave stale entries.
5. **`CONSUMED BY:`** → MUST list every other file in `src/` that imports this one.
   - Verify by grepping for the file's basename without extension. For a file `src/foo/bar.js`, run:
     ```
     grep -rln --include='*.js' "from ['\"].*\\b<bareName>['\"]" src/
     ```
     Replace `<bareName>` with the import-as-written name (often the file basename, sometimes a path segment if the file is `index.js`).
   - If grep returns zero hits, write `leaf`. Otherwise list each consuming file with its `src/...` path.
   - On pre-push, this catches "I made my file but forgot to update the header on every consumer". On pre-merge, it catches "another teammate's PR merged in the meantime and now imports my file — my header still says `leaf`".
6. **Description paragraph** → only rewrite if the file's *responsibility* actually changed. Preserve existing wording otherwise.

**Mechanical pre-push / pre-merge checklist (run all of these in `bash`):**

```
# 1. Files touched in this PR
git diff --name-only main...HEAD -- 'src/*.js'

# 2. For each touched file, sanity-check the header against reality:
#    a) Are all six fields present?
for f in $(git diff --name-only main...HEAD -- 'src/*.js'); do
  head -10 "$f" | grep -E "^// (FEATURE|LAST UPDATED BY|UPDATE DATE|BUILD|DEPENDS ON|CONSUMED BY):" | wc -l
  # Each file should print 6.
done

#    b) Does DEPENDS ON match the actual import graph?
#       Compare the header DEPENDS ON line to:
grep -E "^import .* from ['\"]\\." "$f"

#    c) Who actually consumes this file? (Replace bareName with file basename.)
grep -rln --include='*.js' "from ['\"].*\\bbareName['\"]" src/
```

If any line in the header lies, fix it before pushing or merging. Don't push or merge a stale header — the rest of the team's Claude Code agents trust this metadata.

**New files:** when your PR adds a file, give it a fresh header with `LAST UPDATED BY:` = you, `UPDATE DATE:` = today, `BUILD:` = the latest commit's short SHA. `CONSUMED BY:` is `leaf` only if grep confirms no other file imports it.

**Why this matters for your Claude Code session:** When a teammate's Claude Code opens a file three weeks from now, the header tells it (a) whether the file is current, and (b) where to look next. Stale `DEPENDS ON` makes Claude search a graph that no longer exists; stale `CONSUMED BY` makes it edit this file without checking the real callers and break them silently. Headers compound truth or compound lies — keep them honest.

## Golden rules

1. **Never commit or push directly to `main`.** All changes go through a pull request, even one-line edits. `main` is the shared source of truth — broken `main` blocks the whole team.
2. **Always pull before you start.** Run `git fetch origin && git status` at the start of every session to see if `main` has moved or if you have stale local state.
3. **One branch per task.** Branch off the latest `main`, do the work, open a PR, merge, delete the branch.
4. **Ask the user before any destructive or shared-state action.** This includes `git push --force`, `git reset --hard`, deleting branches, rewriting history, force-merging, or closing/merging someone else's PR.
5. **Verify per-file headers before every push and before every merge.** For each file touched in your PR, the `DEPENDS ON:` and `CONSUMED BY:` lines MUST match reality (run the grep recipe in the [Header maintenance](#header-maintenance--required-on-every-push-and-every-pr-merge) section). Bump `LAST UPDATED BY` / `UPDATE DATE` / `BUILD` at the same time. Stale headers lie to every other teammate's Claude Code that opens the file later.

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

## Optional tooling: review agents

Eric maintains a set of Claude Code slash commands at https://github.com/ericpjtsai/review-agents that review plans and code from three perspectives: Product Director, Product Designer, and Engineering / Tech Lead. They're useful for self-reviewing your own PRs before requesting a teammate review.

To install (one-time, on your own machine):

```bash
git clone https://github.com/ericpjtsai/review-agents.git ~/Desktop/review-agents
mkdir -p ~/.claude/commands
for f in ~/Desktop/review-agents/commands/review-*.md; do
  ln -sf "$f" ~/.claude/commands/$(basename "$f")
done
```

After installing, these slash commands work in any Claude Code session (including Strollo):

- `/review-product` — Product Director review
- `/review-design` — Product Designer review
- `/review-eng` — Engineering / Tech Lead review
- `/review-all` — Runs all three and synthesizes the top issues
- `/review-learn` — Capture a universal lesson back into the review-agents repo

**Notes:**
- These are optional. Nothing in the Strollo workflow requires them.
- Each person's review observations are stored locally on their own machine, not in this repo. Your reviews don't show up on anyone else's machine.
- If you want to contribute a universal lesson back upstream, do it inside `~/Desktop/review-agents`, not here.
