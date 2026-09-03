# Roadmap

This is the living plan for FED-TEMPLE. It is deliberately short and prioritized. Items move from **Planned** → **In Progress** → **Shipped** (and into the [CHANGELOG](CHANGELOG.md)). Dates are aspirational, not promised.

## ✦ Now (v0.1.x — polish the foundation)

- [ ] `prefers-reduced-motion` support — disable auto-orbit and brick-rise animation when the user opts out
- [ ] Stricter CSP documentation + an example `_headers` / `nginx.conf` for self-hosters
- [ ] Better empty-state messaging for rate-limited users (countdown to reset)
- [ ] Mobile: collapsible stats drawer (currently scrolls)
- [ ] Unit tests for the data-harvester aggregation logic (pure functions, no DOM)

## ✦ Next (v0.2 — the time dimension)

- [ ] **Time-lapse slider** — scrub a timeline to watch the temple build itself from the first commit to now, in ~10 seconds. The viral feature.
- [ ] **Full-repo mining with optional PAT** — when a user pastes a Personal Access Token (stored only in browser memory, never logged/transmitted except to `api.github.com`), mine commits from *all* repos, not just the top 5. Lifts the brick cap.
- [ ] **Theme presets** — `matrix` (green-on-black), `ember` (warm), `light` (daytime marble). CSS-variable-driven, instant switch.

## ✦ Later (v0.3 — export & embed)

- [ ] **glTF/OBJ export** — download the temple as a 3D model for Blender, Unity, or 3D printing
- [ ] **Embed snippet generator** — produce an `<iframe>` snippet so users can embed their temple on their personal site
- [ ] **Dynamic Open Graph image** — generate a per-user preview image so shared links look great on Twitter/Discord (client-side canvas render, or a tiny serverless function)
- [ ] **Ambient audio drone** — a subtle generative tone whose pitch tracks temple height; off by default, opt-in

## ✦ Someday (v1.0 — the cathedral grows)

- [ ] **Multi-user comparison temples** — overlay two contributors' temples side by side
- [ ] **First-person walkthrough mode** — WASD + pointer-lock, walk *through* the temple instead of orbiting it
- [ ] **Organization temples** — build a temple for a whole GitHub org, with per-repo sub-shrines
- [ ] **Live mode** — re-fetch periodically (respecting rate limits) and animate new bricks appearing as you commit
- [ ] **Achievements/relics expansion** — more hidden easter eggs tied to profile stats (e.g., "the Arch of First Fork," "the Window of Most-Starred")

## ✦ Explicitly not on the roadmap (anti-goals)

These are things we've considered and **deliberately decided against**, to protect the ethos:

- ❌ A required backend or database. The app stays static.
- ❌ Accounts / login / user data storage on our side.
- ❌ Telemetry or analytics that phone home.
- ❌ A paid tier or paywalled features. See [PRICING.md](PRICING.md).
- ❌ A build step or bundler unless the platform forces it (and only then with an ADR).
- ❌ Auto-committing to users' repos. (The whole project exists in reaction to this kind of noise.)

## ✦ How to influence the roadmap

- Open a [Discussion](https://github.com/FED-OS/FED-TEMPLE/discussions) with the `roadmap` label.
- Upvote existing proposals with 👍 — we weight demand.
- Offer to build it. PRs that ship a planned feature jump the queue.
- Read [ADR.md](ADR.md) to understand why some things are anti-goals before re-proposing them.

## ✦ Versioning

We follow [Semantic Versioning](https://semver.org/). While at 0.x, minor bumps may include breaking changes (documented in the changelog). At 1.0, the data/share schema becomes a stability boundary and breaking changes require a major bump.
