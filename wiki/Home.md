[Uploading Home.md…]()
# Wiki — FED-TEMPLE

> This folder mirrors the structure of a GitHub Project Wiki for offline reference and version control. The canonical, always-current version lives in the repo's markdown files; this is the browsable knowledge base.

## ✦ Pages

- **[Home](../README.md)** — what FED-TEMPLE is and how to start
- **[Usage Guide](../usage.md)** — step-by-step operating instructions
- **[FAQ](../FAQ.md)** — common questions
- **[Architecture](../ADR.md)** — decision records (the *why*)
- **[Roadmap](../ROADMAP.md)** — what's planned and what's deliberately not
- **[Deployment](../DEPLOYMENT.md)** — hosting on Pages, Netlify, Vercel, S3
- **[Build & Install](../BUILD.md)** / **[INSTALL.md](../INSTALL.md)** — there is no build; here's why and how to run
- **[Security](../SECURITY.md)** — policy and posture
- **[Contributing](../CONTRIBUTING.md)** — how to add a stone
- **[Governance](../GOVERNANCE.md)** — how decisions are made
- **[Agent Guide](../CLAUDE.md)** / **[AGENTS.md](../AGENTS.md)** — for AI coding assistants
- **[Citations](../CITATIONS.md)** — how to cite this project

## ✦ The signal-to-structure map (quick reference)

| GitHub signal | Temple element | Where in code |
|---|---|---|
| Commits | Bricks (InstancedMesh, colored by language) | `buildBricks()` |
| Stars | Golden hexagonal tiles | `buildGoldenTiles()` |
| Forks | Marble pillars | `buildPillars()` |
| Languages | Stained-glass windows | `buildStainedGlass()` |
| Contributors | Wandering ghosts | `spawnGhosts()` |
| Recent activity | Aura ring | `buildAura()` |
| 5k+ bricks | Hidden Eternal Commit relic | `maybeSpawnRelic()` |
| Zero commits | Fallen ruins | `buildRuins()` |

## ✦ Engine map

`scripts/temple.js` sections, in order:

1. CONFIG — caps, cache TTL, language colors
2. DOM refs
3. State
4. Utilities — toast, progress, button toggles
5. ASCII loader (hidden gem)
6. Data harvester — `fetchAllData()` with cache + rate-limit handling
7. Demo data — `demoBlueprint()`
8. Scene setup — `initScene()`
9. Temple forge — `buildTemple()` + builders
10. Stats + language pills
11. Interaction — raycaster click → modal
12. Auto-orbit
13. Render loop — `animate()`
14. Shareable link — `encodeShare()` / `decodeShare()`
15. Download standalone HTML
16. Snapshot PNG
17. Orchestration — `runBuild()`
18. UI wiring + keyboard shortcuts
19. Boot

## ✦ Contributing to this wiki

This wiki is just markdown in the repo. Edit the files and open a PR. See [CONTRIBUTING.md](../CONTRIBUTING.md). Keep it accurate to the code — if the code and the wiki disagree, the code wins and the wiki gets a PR.
