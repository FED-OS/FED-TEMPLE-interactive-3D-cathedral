# ADR — Architecture Decision Records

This file records the significant architectural decisions made in FED-TEMPLE, in reverse chronological order. Each entry follows a lightweight ADR format: Context → Decision → Status → Consequences. This is not a changelog (see [CHANGELOG.md](CHANGELOG.md)) — it's the *why* behind the structure.

---

## ADR-0007 — Cap commits at 5,000 bricks and mine only the top 5 repos by stars

**Date:** 2026-09-03 · **Status:** Accepted

**Context.** GitHub's unauthenticated public API allows 60 requests/hour per IP. Mining commits from every repo of a prolific developer (30+ repos) would require dozens of paginated calls and blow the budget on a single build. Rendering tens of thousands of bricks would also drop browser framerate below 60fps on integrated GPUs.

**Decision.** Fetch commits only from the user's top 5 repositories by `stargazers_count`, and cap the total brick count at 5,000. The blueprint is cached in `localStorage` for 24 hours so refreshes are free.

**Consequences.** Power users with many repos see only a slice of their history. This is an acceptable trade for staying within rate limits and keeping the experience smooth. Lifting the cap is gated behind optional PAT support (ADR-0008, planned), which raises the rate limit to 5,000/hour and lets us mine all repos.

---

## ADR-0006 — Use InstancedMesh for bricks with a parallel userData array for raycasting

**Date:** 2026-09-03 · **Status:** Accepted

**Context.** A temple can have up to 5,000 bricks. Rendering each as an individual `Mesh` would create 5,000 draw calls and 5,000 objects in the raycaster's test set — framerate death.

**Decision.** Render all bricks as a single `InstancedMesh` with per-instance color via `instanceColor`. Store per-brick metadata (commit message, date, repo, sha, position) in a parallel `brickGroup._positions` array indexed by `instanceId`. The click raycaster intersects the InstancedMesh and reads `hit[0].instanceId` to look up the commit.

**Consequences.** One draw call for all bricks. The language-pill dimming feature rewrites `instanceColor` in place (cheap). The structure `brickGroup._inst` + `brickGroup._positions` is now load-bearing — any refactor must preserve it or migrate the raycaster and the dimmer together.

---

## ADR-0005 — Shareable links via lz-string-compressed URL hash, no server

**Date:** 2026-09-03 · **Status:** Accepted

**Context.** We want users to share their exact temple without a backend to store data or generate short links. Any server dependency violates the browser-native ethos.

**Decision.** Compress a slimmed blueprint (short keys, arrays-of-arrays for commits) with `lz-string.compressToEncodedURIComponent` and write it to `location.hash`. On load, if a hash is present, decompress and render directly — no API call. The hash is client-side only; no server ever sees it.

**Consequences.** URLs can get long for large profiles (the hash can be several KB), but browsers handle this fine and URL shorteners exist if needed. The slim schema is now a stability boundary — changing it breaks existing shared links. A future schema change requires a versioned prefix in the hash.

---

## ADR-0004 — Three.js and lz-string via pinned CDN import map, not bundled

**Date:** 2026-09-03 · **Status:** Accepted

**Context.** We need Three.js and lz-string. Bundling them would require a build step (rejected by ADR-0001). Vendoring them locally bloats the repo and complicates updates.

**Decision.** Load both from `cdn.jsdelivr.net` at pinned versions (`three@0.160.0`, `lz-string@1.5.0`) via an ESM `importmap` in `index.html`. Pinning prevents supply-chain drift. The [DEPLOYMENT.md](DEPLOYMENT.md) documents how to self-host these for fully-offline use if desired.

**Consequences.** First load requires network access to the CDN. The CSP `script-src` must allow `cdn.jsdelivr.net`. For maximum integrity, self-hosters can download the files and retarget the import map (see [INSTALL.md](INSTALL.md)). This trade keeps the repo lean and the dev loop build-free.

---

## ADR-0003 — Render commit messages with textContent, never innerHTML

**Date:** 2026-09-03 · **Status:** Accepted

**Context.** Commit messages are user-controlled remote data fetched from GitHub. A malicious or careless commit message could contain HTML/script and execute in the page if inserted via `innerHTML`.

**Decision.** All commit-message display (the click modal, the stats) uses `textContent` assignment. No user-controlled string is ever injected as HTML.

**Consequences.** We lose the ability to render rich formatting in commit messages (which we don't want anyway). XSS via commit message is structurally impossible. This is a security invariant — any future feature displaying remote text must follow the same rule. See [SECURITY.md](SECURITY.md).

---

## ADR-0002 — One engine file: scripts/temple.js, sectioned by comments

**Date:** 2026-09-03 · **Status:** Accepted

**Context.** The engine has several subsystems (data harvesting, scene setup, the forge, interaction, share/export). Splitting into many tiny files adds import overhead and makes the flow harder to follow top-to-bottom.

**Decision.** Keep the engine in a single `scripts/temple.js`, organized into clearly-commented sections (config → DOM → state → utils → loader → harvester → demo → scene → forge → stats → interaction → orbit → loop → share → download → snapshot → orchestration → boot). Extract a subsystem to its own file only when it grows past comfortable reading (~150 lines).

**Consequences.** New contributors can read the whole engine in one pass. The file is longer than a microservice-y split would be, but more navigable. The "extract when large" rule prevents bloat. This is a readability-first choice, not a dogma against multiple files.

---

## ADR-0001 — No build step, no backend, no required auth — the ethos

**Date:** 2026-09-03 · **Status:** Accepted (constitutional)

**Context.** The project exists partly in reaction to tools that auto-commit noise, require backends, demand API keys for basic use, and bloat with build tooling. We want the opposite: open `index.html`, get the experience.

**Decision.** FED-TEMPLE is static, browser-native, and build-free. No required backend, no required API key for the default flow, no auto-commits, no telemetry. The three rules (browser-native, no bullshit, brutalist clarity) are the constitution; everything else is statute.

**Consequences.** This constrains every future decision. Any proposal requiring a backend, a build step, required auth, or telemetry is rejected unless it passes an explicit maintainer-consensus override (see [GOVERNANCE.md](GOVERNANCE.md)). ADRs 0002–0007 all derive from this one. Changing it requires amending the ethos itself.
