# Summary

**FED-TEMPLE — The Digital Monument** is a browser-native, zero-backend, zero-build-step tool that transforms a GitHub username into an interactive 3D cathedral. It is part of the FED-OS ecosystem.

## ✦ In one paragraph

Enter a GitHub username, click Build, and FED-TEMPLE mines the public GitHub REST API (no token, CORS-enabled) for your repositories, commits, stars, forks, and languages, then forges a walkable Three.js temple where commits become colored bricks, stars become glowing golden tiles, forks become marble pillars, languages become stained-glass windows, and contributors become wandering ghosts. Everything runs in the browser. There is no server, no API key, no auto-commit, no telemetry — and no bullshit.

## ✦ The signal-to-structure map

| GitHub signal | Temple element |
|---|---|
| Commits | Bricks (colored by language, stacked chronologically) |
| Stars | Golden hexagonal tiles on the ground |
| Forks | Marble pillars around the perimeter |
| Languages | Stained-glass windows (sized by bytes) |
| Contributors | Translucent ghosts wandering the grounds |
| Recent activity | A pulsing aura ring |
| 5,000+ brick temples | A hidden "Eternal Commit" relic (easter egg) |
| Zero-commit users | Fallen ruins (an aesthetic empty state) |

## ✦ What's shipped (v0.1.0)

- One-click build with live progress + cancel + error handling
- Brick-by-brick animated construction
- Stats panel with interactive language pills
- Click-a-brick commit modal with GitHub links
- Shareable URL-hash links (lz-string compressed, no server)
- Download as standalone self-contained HTML
- Snapshot to PNG
- 24h localStorage cache to respect rate limits
- Demo mode (auto-runs on first visit)
- Auto-orbit, ghosts, ruins, aura, relic, ASCII loader
- Keyboard shortcuts (R / S / H)
- InstancedMesh rendering for 60fps with thousands of bricks
- Full governance + docs + CI/CD + issue/PR templates

## ✦ What's next (see ROADMAP.md)

- Time-lapse slider
- Theme presets
- glTF/OBJ export
- Private repos via client-side PAT
- Ambient audio
- Dynamic Open Graph images
- `prefers-reduced-motion` support

## ✦ The numbers

- **Dependencies:** 2 runtime (Three.js, lz-string), both via pinned CDN
- **Build step:** 0
- **Backend:** 0 servers
- **API keys required:** 0
- **License:** MIT (free, forever, for everything)
- **Price:** $0

## ✦ The ethos

Browser-native. No bullshit. Brutalist clarity.

FED-TEMPLE is a monument — and monuments belong to everyone who walks through them.
