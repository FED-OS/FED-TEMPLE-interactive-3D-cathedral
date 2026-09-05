# Changelog

All notable changes to FED-TEMPLE are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Time-lapse slider to scrub temple construction across history
- Theme presets (matrix, ember, light)
- glTF/OBJ model export
- Private-repo support via client-side Personal Access Token
- Ambient audio drone keyed to temple height
- Dynamic Open Graph image generation
- `prefers-reduced-motion` support
- Full-repo commit mining when a PAT is supplied

## [0.2.0] — Phase 10: Labels + Two Build Modes

### Added
- 🏷️ **Temple labels (CSS2DRenderer)** — every temple now wears a label showing the repo name, commit count, and a language-color dot. You can read what each build is *without clicking anything*. Labels distance-fade so far ones never clutter the scene.
- 🖱️ **Clickable labels** — clicking a repo label opens that repo's file-tree panel; clicking the big apex label (the username) toggles between build modes.
- 🏛️ **Build mode "one temple"** — one grand ziggurat forged from *every* repo the user has, with a monumental front staircase and the user's name crowning the apex.
- 🗺️ **Build mode "all temples"** — the grand temple splits into a ring of small temples, one per repo, each labeled with its name/commits/language.
- 🔀 **Instant mode switch** — segmented-control toggle buttons in the UI plus the `M` keyboard shortcut. Switching rebuilds from the cached blueprint: zero API calls, zero refetch, instant.
- 📦 **Every-repo mining** — commits are now mined breadth-first from *all* non-fork repos (up to 30), with extra depth pages for the top starred flagships, so every repo contributes bricks to the monument.
- 📷 Per-mode default camera framing (the grand temple frames wide; the temple ring frames to fit the whole ring).
- Standalone HTML export now supports both build modes *and* CSS2D labels, with inline toggle buttons.

### Changed
- Cache key bumped to `v2` so existing users get a fresh every-repo mining pass.
- Hint badge text updated to headline the new label + `M`-switch interactions.
- styles.css: brutalist `.lbl` / `.lbl.big` / `.l-dot` / `.l-name` / `.l-n` label styles + segmented-control `active` state for the mode toggle.

## [0.1.0] — 2026-09-03

### Added
- 🛕 Core temple forge: bricks (commits), golden tiles (stars), pillars (forks), stained-glass windows (languages)
- ⛏ One-click build from a GitHub username using the public REST API (CORS, no token)
- 📊 Live stats panel with interactive language pills (click to dim a language's bricks)
- 🖱 Click-a-brick modal showing commit message, date, repo, and a link to the commit on GitHub
- 🔗 Shareable links compressing the full blueprint into the URL hash via `lz-string` (no server)
- 💾 Download as standalone self-contained HTML (Blob)
- 📸 Snapshot-to-PNG button for one-click social screenshots
- 🗑 Cancel button via `AbortController` + graceful error toasts
- 💾 24-hour `localStorage` cache to avoid repeated API calls
- 📱 Responsive layout + touch-friendly `OrbitControls`
- ✨ Demo mode auto-loads on first visit
- 👻 Ghosts of contributors wandering the grounds
- 🔄 Auto-orbit on load, resuming after 30s of idle
- 🏚 Fallen-ruins empty state for users with zero commits
- 🪐 Aura ring pulsing with recent activity
- ✦ Hidden "Eternal Commit" relic on 5,000+ brick temples
- 🖥 ASCII-art loader while WebGL initializes
- ⌨️ Keyboard shortcuts: `R` reset, `S` snapshot, `H` toggle UI
- Rate-limit remaining display in the UI credit chip
- InstancedMesh rendering for thousands of bricks at 60fps

### Docs
- README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, ROADMAP, DEPLOYMENT, BUILD, INSTALL, ADR, FAQ, NOTICE, CITATIONS, COPYING, GOVERNANCE, PRICING, SUMMARY, CLAUDE, AGENTS, AUTHORS, MAINTAINERS
- Issue templates (bug, feature, custom) + PR template
- GitHub Actions workflows (build, test, ci, cd, deploy, release, publish, pr, stale, labeler, greetings, codeql, main, pages, dependency-review, scorecards)

### Notes
- Initial public release. Brutalist, browser-native, bullshit-free.
