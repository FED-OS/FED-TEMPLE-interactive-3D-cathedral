# Prompts

Starter prompts for AI-assisted development of FED-TEMPLE. Drop these into your agent of choice (Claude, Copilot Chat, Cursor, Aider) to bootstrap common tasks. Each prompt encodes the ethos so the agent doesn't drift.

## ✦ How to use

1. Copy a prompt below.
2. Paste it into your AI coding assistant pointed at the FED-TEMPLE repo.
3. The agent should read [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) first (the prompts remind it to).

---

## Prompt: Add a new temple element

```
You are working in the FED-TEMPLE repo (a static, browser-native Three.js app; read CLAUDE.md and AGENTS.md and ADR.md before coding).

Task: Add a new temple element that maps {GITHUB_SIGNAL} to {VISUAL_ELEMENT}.

Constraints (ethos — non-negotiable):
- No backend, no required auth, no build step, no telemetry.
- Vanilla JS / ES modules. Use the existing InstancedMesh pattern if it's many objects.
- Must hold ~60fps at 5,000 bricks on a 2020-era integrated GPU.
- Insert commit/remote text via textContent, never innerHTML.

Steps:
1. Add the data field to the blueprint in fetchAllData() (respect the 60 req/hr rate limit — reuse existing calls if possible).
2. Add a build{Element}() function next to buildBricks/buildGoldenTiles/etc.
3. Call it from buildTemple().
4. Update the stats panel if user-facing.
5. Add a CHANGELOG.md entry under Unreleased and an ADR.md entry if architectural.
6. Test in a browser per the checklist in CLAUDE.md; report console state.

Do not git commit or push. Open a PR-ready diff and describe it.
```

## Prompt: Add the time-lapse slider (roadmap item)

```
You are working in FED-TEMPLE (read CLAUDE.md, AGENTS.md, ROADMAP.md, ADR.md first).

Task: Implement the time-lapse slider (ROADMAP "Next" section): a bottom-of-screen slider that scrubs the temple's construction from the first commit to now.

Requirements:
- The blueprint already has commits sorted chronologically (oldest first). Use the index as the time proxy.
- Dragging the slider reveals bricks 0..N and hides the rest. Use the existing InstancedMesh: scale hidden instances to 0 (don't dispose) so scrubbing is instant.
- No backend, no new deps. Vanilla JS slider element in index.html, styled in styles.css.
- Respect prefers-reduced-motion: if set, skip the animated build and just show the final state.
- Add a CHANGELOG entry and an ADR entry (this changes how buildBricks exposes state — load-bearing per ADR-0006).

Do not commit/push. Produce the diff and a manual test report.
```

## Prompt: Performance audit

```
Audit FED-TEMPLE's scripts/temple.js for performance against the 60fps@5000-bricks bar (see CLAUDE.md).

Deliver:
1. A list of any per-frame work that could be hoisted out of the animate() loop.
2. Any geometry/material created inside loops that should be shared.
3. Whether the InstancedMesh brick pipeline and the ghost/aura/relic updates are efficient.
4. Concrete, minimal diffs for the top 3 wins, each conforming to the ethos.

Do not commit/push. Present diffs and rationale.
```

## Prompt: Security review

```
Review FED-TEMPLE for security issues against SECURITY.md and ADR-0003.

Check:
- All remote/user-controlled strings inserted via textContent (no innerHTML/eval).
- CDN pins are intact (three@0.160.0, lz-string@1.5.0).
- No secrets, tokens, or PII logged or exfiltrated.
- The share-link hash decode is safe (no eval of decompressed data).
- The standalone-HTML export is XSS-safe.

Deliver a findings list with severity and minimal fixes. Do not commit/push.
```

## Prompt: Write an ADR entry

```
Write a new ADR entry for FED-TEMPLE (append to ADR.md, next number after the last).

Topic: {DECISION}

Format: Context → Decision → Status → Consequences (match existing entries' tone: direct, no corporate hedging).
Reference relevant prior ADRs. Ensure the decision does not violate ADR-0001 (the ethos) without explicit justification.
```

## Prompt: Improve docs

```
Improve FED-TEMPLE's docs. Pick the doc with the most user impact and tighten it:
- Remove filler, keep the brutalist/direct voice.
- Ensure technical accuracy by reading the actual code, not guessing.
- Add cross-links to related docs (README, FAQ, SUPPORT, ADR, ROADMAP).
- Do not add marketing fluff or false claims.

State which doc you improved and paste the diff. Do not commit/push.
```
