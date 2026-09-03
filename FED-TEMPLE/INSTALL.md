# Install

FED-TEMPLE has no installation in the traditional sense — there's no `npm install`, no binary, no system package. You either run it locally from source or open a hosted copy. This page covers both.

## ✦ Option 1 — Run from source (recommended for development)

### Prerequisites
- **Git** (to clone)
- **Python 3** (for the built-in HTTP server) **OR** Node.js (for `npx serve`) **OR** any static file server
- A modern browser with **WebGL** enabled (Chrome, Firefox, Edge, or Safari, current version)

### Steps

```bash
git clone https://github.com/FED-OS/FED-TEMPLE.git
cd FED-TEMPLE

# serve it (pick one):
python3 -m http.server 8000        # → http://localhost:8000
# npx serve .                      # → http://localhost:3000
# php -S localhost:8000            # → http://localhost:8000
```

Open the printed URL in your browser. Done.

> **Important:** serve over `http://` — do **not** open `index.html` directly via `file://`. ES module imports from the CDN import map require an http origin; `file://` will fail with CORS/module errors.

## ✦ Option 2 — Use a hosted copy

Once deployed (see [DEPLOYMENT.md](DEPLOYMENT.md)), just open the URL. No install. No account. The app auto-runs demo mode on first visit, and you can enter your GitHub username to build your own temple.

## ✦ Option 3 — Download a standalone temple

If someone shared a temple with you via the **💾 Save HTML** feature, you received a single `.html` file. Just double-click it (or open it in a browser). It's self-contained — it only needs internet access to load Three.js and lz-string from the CDN the first time.

## ✦ Verifying it works

1. The ASCII-art loader appears briefly, then the demo temple auto-builds.
2. The dev console (F12) should be **clean** — no red errors.
3. Enter your GitHub username and click **⛏ Build Temple**. The progress bar advances and the temple rises.

If you see a blank screen, check:
- WebGL is enabled in your browser.
- You opened the app over `http://` (not `file://`).
- Your browser is current (Three.js r160 needs a recent browser).

## ✦ Optional: pin the CDN libraries locally

If you want to run fully offline (after the first data fetch, which is cached), download the CDN files and point the import map at them:

```bash
mkdir -p vendor
curl -L -o vendor/three.module.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
curl -L -o vendor/lz-string.min.js https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
# (also fetch the addons/ folder used by OrbitControls)
```

Then edit the import map in `index.html` to reference `./vendor/...` instead of the CDN, and tighten the CSP `script-src` to `'self'` (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## ✦ Uninstall

Delete the cloned folder. Clear `localStorage` for the site if you want to remove cached temple data (dev tools → Application → Local Storage). There is nothing else — no global installs, no services, no residue.
