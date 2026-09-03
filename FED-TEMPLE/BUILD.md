# Build

## ✦ There is no build

FED-TEMPLE has **no build step by design**. The app is static HTML, CSS, and vanilla ES-module JavaScript served as-is. There is no bundler, no transpiler, no minifier in the critical path.

This is an intentional ethos decision, recorded in [ADR.md](ADR.md): browser-native, no bullshit. Adding a build step requires an Architecture Decision Record and maintainer consensus.

## ✦ "Build" in this repo means: validate + assemble artifacts

The GitHub Actions in `.github/workflows/build.yml` and `.github/workflows/ci.yml` don't compile anything — they validate that the runtime files exist and are syntactically sound, then package the static files for deployment.

## ✦ Local validation

```bash
# 1. Syntax-check the JS (no execution, just parse)
node --check scripts/temple.js

# 2. Confirm required files exist
test -f index.html && test -f styles.css && test -f scripts/temple.js && test -f social-image.png && echo "runtime files present"

# 3. Start a local server and sanity-check it responds
python3 -m http.server 8000 &
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/   # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/styles.css  # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/scripts/temple.js  # expect 200
kill %1
```

## ✦ What CI does (see `.github/workflows/`)

- **build.yml** — checks out the repo, verifies the four runtime files exist, runs `node --check` on `scripts/temple.js`, starts a static server, and curls the key paths for 200s. Uploads the repo as a build artifact (zipped static files).
- **test.yml** — a lighter HTTP sanity check on pull requests.
- **ci.yml** — the umbrella workflow that gates merges to `main` (runs build + test).
- **pages.yml** — deploys the static files to GitHub Pages.
- **codeql.yml** — runs GitHub's semantic code analysis for security.
- **dependency-review.yml / scorecards.yml** — supply-chain and security hygiene (even though we have no npm deps, these guard the CDN-pinned runtime and the Actions we use).

## ✦ Producing a distributable artifact

Because the app is static, "building a release" means zipping the runtime files:

```bash
zip -r fed-temple-0.1.0.zip index.html styles.css scripts/ social-image.png README.md LICENSE
```

The **release.yml** workflow does this automatically on tag push and attaches it to a GitHub Release.

## ✦ If you ever need to add a build step

1. Open a Discussion stating the problem the build step solves (e.g., "we need tree-shaking because Three.js addons are getting heavy").
2. Write an [ADR.md](ADR.md) entry with the decision and alternatives considered.
3. Get maintainer consensus (see [GOVERNANCE.md](GOVERNANCE.md)).
4. Only then: add the tooling, update this doc, update [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md), and ensure CI still passes.

Until then: there is no build, and that's the point.
