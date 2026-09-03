# CLAUDE.md

> Guidance for Claude (and any AI coding agent) working in this repository.

## ✦ Project context

FED-TEMPLE is a **static, browser-native** web app that turns a GitHub username into an interactive 3D temple using Three.js. It is part of the FED-OS ecosystem. The full vision, features, and ethos are in [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## ✦ Non-negotiable rules (the ethos)

1. **Browser-native first.** No required backend, no required API key for the default flow, no auto-commits, no telemetry. Everything must work by opening `index.html`.
2. **No bullshit.** No fake metrics, no dark patterns, no dependency sprawl. Prefer the platform. If a feature needs a heavy library for a small job, it doesn't ship.
3. **Brutalist clarity.** Dark, monospace, honest UI. Loading states say what's happening. Errors say what broke.

Do not propose changes that violate these. If a user asks for something that would (e.g., "add a server that stores temples"), push back and offer a browser-native alternative.

## ✦ Tech stack — do not change without an ADR

- **Vanilla JS, ES modules.** No TypeScript, no bundler, no transpile step. There is no `package.json` build script by design.
- **Three.js r160** loaded via CDN import map in `index.html`.
- **lz-string 1.5.0** via CDN for URL-hash compression.
- **No framework.** DOM is manipulated directly. CSS is hand-written in `styles.css`.

If you believe a build step or framework is truly necessary, open a Discussion and write an ADR. Do not just add it to a PR.

## ✦ File map

- `index.html` — the shell. UI markup + import map + loads `scripts/temple.js`.
- `styles.css` — all styles. Theme variables in `:root`.
- `scripts/temple.js` — the engine. ONE file, organized in clearly-commented sections. Read it top to bottom: config → DOM → state → utils → ASCII loader → data harvester → demo data → scene setup → forge → stats → interaction → auto-orbit → render loop → share → download → snapshot → orchestration → boot.
- `social-image.png` — Open Graph preview.
- Everything else (`*.md`, `.github/`) is governance/docs/CI.

## ✦ How to run

```bash
python3 -m http.server 8000   # from the repo root
# open http://localhost:8000
```

Do not open via `file://` — ES module imports need an http origin.

## ✦ How to test changes

There is no automated test suite for the 3D rendering yet (it's visual). To validate a change:

1. Open `http://localhost:8000` in Chromium/Firefox.
2. Open dev console — it should be clean (no red errors unless `?debug=true`).
3. Click **✨ Demo** — temple should build.
4. Enter a real username (e.g., `torvalds`) and click **⛏ Build Temple** — progress bar should advance, temple should rise brick-by-brick, stats should populate, language pills should work.
5. Click a brick — modal should show commit info with a valid GitHub link.
6. Try **🔗 Share**, **📸 Snapshot**, **💾 Save HTML**, **🏠 Home**, **🔄 Auto-Orbit**.
7. Enter a bogus username — should show a friendly error toast, not crash.
8. Resize the window — canvas should adapt.

For the workflows (`.github/workflows/`), there is a `test.yml` that does a basic HTTP sanity check and `build.yml` that validates file presence. See [BUILD.md](BUILD.md).

## ✦ Code conventions

- 2-space indent, semicolons, trailing commas.
- `const` → `let` → never `var`.
- Descriptive names: `buildBricks`, not `procGeo3`.
- Comments explain *why*.
- Commit messages: Conventional Commits, imperative, one line.
- Keep `temple.js` readable. If a section grows past ~150 lines, consider extracting to `scripts/<name>.js` and importing it.
- Performance: must hold 60fps at 5,000 bricks on a 2020-era integrated GPU. Use `InstancedMesh`. Profile before and after.

## ✦ Things that are load-bearing (don't break casually)

- The **5,000-brick cap** and **top-5-repos** strategy — these exist to respect GitHub's 60 req/hr rate limit. Changing them without a PAT plan will get users rate-limited.
- The **`localStorage` 24h cache** — same reason.
- The **InstancedMesh brick rendering** with `instanceColor` — the language-pill dimming and the click raycaster both depend on the `brickGroup._inst` + `brickGroup._positions` structure.
- The **URL-hash share encoding** (`encodeShare`/`decodeShare`) — changing the slim schema breaks existing shared links.
- The **commit modal** uses `textContent` for the message (XSS safety from malicious commit messages). Keep it that way.

## ✦ When you're unsure

- Read [ADR.md](ADR.md) for past decisions and their rationale.
- Read [ROADMAP.md](ROADMAP.md) to see if a feature is already planned.
- Prefer asking in a Discussion over assuming. But if you're an autonomous agent mid-task, prefer the simplest browser-native interpretation and document your assumption in the PR description.

## ✦ Don'ts

- Don't add analytics, telemetry, or "phone home" code.
- Don't add a required backend or required auth.
- Don't introduce a build step or bundler without an ADR.
- Don't use `eval` or `innerHTML` with remote/user data.
- Don't auto-commit. Don't push without explicit instruction.
- Don't add a dependency without justifying it against "no bullshit."
