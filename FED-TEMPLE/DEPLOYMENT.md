# Deployment

FED-TEMPLE is a static site — four files and a folder do all the work. Deployment is "put the files on a host that serves them over HTTP." This document covers the common targets and the recommended hardening.

## ✦ What to deploy

The minimal set:

```
index.html
styles.css
scripts/temple.js
social-image.png
```

Optionally include the `prompts/`, `wiki/`, `discussion/` folders and the `.md` docs if you want the docs browseable on the host. The `.github/` folder is for GitHub Actions and is not part of the runtime.

## ✦ GitHub Pages (recommended — it's where the repo lives)

1. Push the repo to GitHub (e.g., `FED-OS/FED-TEMPLE`).
2. Repo **Settings → Pages**.
3. Source: **Deploy from a branch** → `main` → `/ (root)`.
4. Save. Your site goes live at `https://<user>.github.io/FED-TEMPLE/` within a minute.

The included `.github/workflows/pages.yml` is an alternative that builds and deploys via Actions if you prefer that path (it's a no-build static deploy, so the built-in Pages source is simpler).

## ✦ Netlify

1. Drag the repo folder onto [app.netlify.com/drop](https://app.netlify.com/drop), **or**
2. Connect the GitHub repo. Build command: *(none)*. Publish directory: `.` (root).

## ✦ Vercel

1. `npm i -g vercel` (one-time), then `vercel` in the repo root.
2. Framework preset: **Other**. No build command. Output directory: `.`.

## ✦ Cloudflare Pages

1. Pages → Create project → Connect to Git.
2. Build command: *(empty)*. Build output directory: `.`.

## ✦ Static object storage (S3 / R2 / GCS)

Upload the four runtime files (and any docs you want served) to a bucket with public-read and a website index document of `index.html`. Front it with a CDN for HTTPS.

```bash
# S3 example
aws s3 sync . s3://your-bucket/ --exclude ".git/*" --exclude ".github/*" --delete
```

## ✦ Self-host with a basic server

```bash
python3 -m http.server 8000        # dev
# or, for production-ish:
npx serve .                        # node
# or caddy / nginx serving the root
```

## ✦ Hardening (recommended for any public deployment)

Add these headers (mechanism depends on host — `_headers` for Netlify/Cloudflare, `vercel.json` for Vercel, nginx config, etc.):

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://ko-fi.com https://cdn.jsdelivr.net; connect-src 'self' https://api.github.com; font-src 'self'; frame-ancestors 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

Notes on the CSP:

- `script-src` allows `cdn.jsdelivr.net` for Three.js and lz-string.
- `connect-src` allows only `api.github.com` (the only API we call).
- `img-src` allows `ko-fi.com` for the support button and `data:` for the favicon.
- `style-src 'unsafe-inline'` is needed because the ASCII loader and some dynamic styles are inline; acceptable for a static app with no user-controlled inline styles.

Serve over **HTTPS** always. GitHub Pages, Netlify, Vercel, and Cloudflare do this automatically.

## ✦ CDN dependency integrity

The app loads Three.js and lz-string from `cdn.jsdelivr.net` at pinned versions. If you want maximum integrity for a self-host, download those files locally and update the import map in `index.html` to point at local paths. Then tighten the CSP to only `'self'` for `script-src`.

## ✦ Verifying a deployment

After deploy:

1. Open the URL — the ASCII loader shows, then the demo temple auto-builds.
2. Enter a real username and build. Stats populate, bricks rise.
3. Click **🔗 Share** — confirm the URL hash is set and the clipboard copy works.
4. Open the shared link in a new tab — it should render instantly from the hash (no API call).
5. Click **📸 Snapshot** — a PNG downloads.
6. Check the dev console — should be clean.
7. View page source — confirm `social-image.png` is referenced for OG previews.

## ✦ Rollback

Because there's no backend and no database, rollback is trivial: redeploy a previous commit (or a previous static artifact). There is no data migration to worry about — each user's blueprint lives in their own browser's `localStorage` and in their shared-link hashes.
