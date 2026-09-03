# Contributing to FED-TEMPLE

First: thank you for wanting to build. FED-TEMPLE is a monument, and monuments are built stone by stone — by many hands.

## ✦ The ethos

This project lives by three rules. Break them and your PR will not merge.

1. **Browser-native first.** Everything must run client-side. No required backend, no required API keys for the default experience, no auto-commits, no telemetry that phones home. A user should be able to download the folder, open `index.html`, and get the full experience offline (after the first data fetch, which is cached).
2. **No bullshit.** No fake metrics, no dark patterns, no dependency sprawl. If a feature needs a 200KB library to render a button, it doesn't ship. Prefer the platform.
3. **Brutalist clarity.** The UI is dark, monospace, and honest. Loading states say what's happening. Errors say what broke. No spinners that lie.

## ✦ Getting started

```bash
git clone https://github.com/FED-OS/FED-TEMPLE.git
cd FED-TEMPLE
python3 -m http.server 8000
```

Open `http://localhost:8000`. That's the whole dev loop. There is no build step and there will never be one unless the platform forces it.

## ✦ Architecture in 60 seconds

- `index.html` — the shell. Loads Three.js and `temple.js` via an ESM import map (CDN). All UI markup lives here.
- `styles.css` — every visual rule. CSS variables at the top define the theme.
- `scripts/temple.js` — the engine. It is one file on purpose: it is easier to read a monument than a suburb. The sections, in order: config → DOM refs → state → utilities → ASCII loader → data harvester → demo data → scene setup → temple forge (bricks, tiles, pillars, glass, aura, relic, ghosts, ruins) → stats/pills → interaction → auto-orbit → render loop → share link → download HTML → snapshot → orchestration → boot.

If you add a major subsystem, give it its own file under `scripts/` and import it. Do not turn `temple.js` into a labyrinth.

## ✦ How to propose a change

1. **Open an issue first** for anything bigger than a typo or a bug fix. Describe the feature, why it fits the ethos, and sketch the data flow. We'll align before you write 400 lines.
2. **Fork & branch** from `main`: `git checkout -b feat/my-stone`.
3. **Keep PRs small.** One concern per PR. A PR that touches the brick builder, the UI, and the docs will be asked to split.
4. **Test in a browser.** Open the dev console. It should be clean (see the "console cleanup" guideline — suppress noise unless `?debug=true`). Try a real username, the demo button, and an empty/invalid username.
5. **Update docs** if you change behavior: `README.md`, `CHANGELOG.md`, and any relevant `ADR.md` entry.
6. **Use the PR template.** Fill in every section. "It works on my machine" is not a testing note.

## ✦ Code style

- Vanilla JS, ES modules. No TypeScript yet (we may add it if the file grows past comfortable reading).
- 2-space indentation. Semicolons yes. Trailing commas yes.
- Prefer `const` → `let` → never `var`.
- Name things like a human: `buildBricks`, not `procGeo3`.
- Comments explain *why*, not *what*. The code already says what.

## ✦ Commit messages

Conventional Commits, short and imperative:

```
feat: add time-lapse slider
fix: brick z-position drift on large temples
docs: clarify rate-limit caching
chore: bump three to 0.161
```

No auto-commits. No "updated" or "misc". If you can't describe it in one line, it's probably two PRs.

## ✦ Performance bar

The temple must stay at **60fps** with 5,000 bricks on a 2020-era laptop with integrated graphics. If your feature drops that, use `InstancedMesh`, frustum culling, or LOD. Profile with the browser's Performance tab before and after.

## ✦ Accessibility

- Every interactive control must be reachable by keyboard and have a visible focus state.
- The stats panel and commit modal are real DOM, not canvas — screen readers can reach them.
- Color is never the *only* signal (language pills have text labels).
- Motion respects `prefers-reduced-motion` (on the roadmap; if you ship it, you're a hero).

## ✦ Questions?

Open a [Discussion](https://github.com/FED-OS/FED-TEMPLE/discussions). Check [FAQ.md](FAQ.md) and [SUPPORT.md](SUPPORT.md) first.

Build well.
