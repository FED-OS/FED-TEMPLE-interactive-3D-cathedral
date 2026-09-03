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
