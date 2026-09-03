# AGENTS.md

> Operating manual for AI coding agents (Claude, Copilot, Cursor, Aider, etc.) working in FED-TEMPLE.

This file complements [CLAUDE.md](CLAUDE.md) (which is Claude-specific guidance) with agent-agnostic rules. If you are an AI agent making changes here, read both.

## ✦ Who you are and what you're doing

You are an autonomous or semi-autonomous coding agent modifying a **static, browser-native Three.js app** that visualizes GitHub contribution history as a 3D temple. The repo has no build step and no backend. Your job is to make correct, minimal, ethos-compliant changes.

## ✦ The ethos (hard constraints)

1. **Browser-native.** No required backend, no required API key, no auto-commits, no telemetry. The app must work by opening `index.html` over http.
2. **No bullshit.** No fake metrics, dark patterns, or dependency sprawl. Prefer the platform.
3. **Brutalist clarity.** Dark monospace UI. Honest loading and error states.

If a task would violate these, refuse or propose a compliant alternative. Do not silently comply.

## ✦ Before you write code

1. Read [README.md](README.md), [CLAUDE.md](CLAUDE.md), and [CONTRIBUTING.md](CONTRIBUTING.md).
2. Read the relevant section of `scripts/temple.js`. The file is one deliberately-readable module with section comments.
3. Check [ROADMAP.md](ROADMAP.md) — the feature may already be planned with constraints.
4. Check [ADR.md](ADR.md) — past decisions may bind you.

## ✦ Environment

- The dev loop is `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000`.
- Do **not** open via `file://` — ES module imports fail.
- There is no `npm install`. There is no build. There is no test runner for the 3D layer (it's visual — see the manual test checklist in [CLAUDE.md](CLAUDE.md#how-to-test-changes)).
- You have Node available if you need to syntax-check: `node --check scripts/temple.js`.

## ✦ Making changes

- **Minimal diffs.** Change only what's needed. The diff should read like a single intent.
- **No unrelated refactors.** If you spot a smell, file an issue or propose it separately; don't sneak it into a feature PR.
- **One concern per PR.** A PR that touches bricks, UI, and docs will be split.
- **Keep `temple.js` readable.** If a new subsystem is large, put it in `scripts/<name>.js` and import it. Don't bloat the single file past comfortable reading.
- **Test in a browser** before declaring done. Console must be clean. Run the manual checklist.
- **Update docs** if behavior changes: [README.md](README.md), [CHANGELOG.md](CHANGELOG.md), [usage.md](usage.md), and an [ADR.md](ADR.md) entry for non-trivial decisions.

## ✦ Commits and pushing

- **No auto-commits.** Never run `git commit` or `git push` without an explicit human instruction. If you believe a commit is warranted, say so and stop.
- When you do commit (on instruction), use Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`. Imperative mood. One line.
- Branch from `main`: `feat/<short-slug>` or `fix/<short-slug>`.

## ✦ Things that will get your PR rejected

- A required backend, required auth, or telemetry.
- A build step or bundler added without an ADR.
- A new dependency that's heavy for a small job.
- `eval` or `innerHTML` with remote/user-controlled data.
- Breaking the 5,000-brick cap or rate-limit strategy without a PAT plan.
- Breaking the URL-hash share schema without a migration note.
- A diff that's actually three PRs glued together.
- "It works on my machine" with no browser test evidence.

## ✦ When you're stuck

- If a task is ambiguous, prefer the **simplest browser-native** interpretation and state your assumption.
- If you can't test something (e.g., no GPU), say so explicitly in the PR — don't claim it works.
- If a task seems to violate the ethos, stop and explain the conflict; propose a compliant path.
- Don't hallucinate APIs or Three.js features — verify against the pinned `three@0.160.0` docs if unsure.

## ✦ Security

Read [SECURITY.md](SECURITY.md). Key points: no secrets by default, commit messages rendered with `textContent` (not innerHTML), CDN versions pinned, any future token support stays client-side only.

## ✦ Tone

The project's voice is direct, a little irreverent, anti-corporate. Match it in docs and commit messages. No corporate hedging. No "leveraging synergies." Monuments aren't built by committees.
