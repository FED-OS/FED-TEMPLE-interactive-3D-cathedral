# FAQ — Frequently Asked Questions

## ✦ General

### Is FED-TEMPLE free?
Yes. It's [MIT-licensed](LICENSE) and runs entirely in your browser. There is no paid tier and no plan for one. See [PRICING.md](PRICING.md) for the explicit "always free, always open" statement.

### Does it need my GitHub password or a token?
No. It uses the public GitHub REST API, which is CORS-enabled and requires no authentication for public data. Optional Personal Access Token support for private repos is on the roadmap and will always stay client-side.

### Does it send my data anywhere?
No. The only network calls are to `api.github.com` (to fetch public data) and to your CDN of Three.js/lz-string (to load the engine). Nothing is sent to FED-OS or any third party. Your blueprint is cached in your own browser's `localStorage`.

### Is there a backend?
No. It's a static site. You can host it on GitHub Pages, Netlify, a USB stick, or a floppy disk.

## ✦ Data & accuracy

### Why aren't all my commits shown?
To stay within GitHub's 60-requests/hour unauthenticated rate limit, FED-TEMPLE mines commits from your **top 5 repositories by star count**, capped at **5,000 bricks total**. This captures the bulk of most developers' visible output. Full mining is a roadmap item gated behind optional PAT support.

### Why does the brick count differ from my GitHub profile?
GitHub's contribution graph includes commits to *other people's* repos and repos where you're a collaborator, which the `/users/{username}/repos` endpoint does not surface. FED-TEMPLE reflects commits to **your own public repos**. This is a known scope boundary, documented intentionally.

### How are languages counted?
Each repo contributes its `size` (in KB, from the API) to its primary `language`. The stained-glass windows scale by that byte-share. It's an approximation, not a line-count — GitHub's API doesn't expose per-language line counts without a separate call per repo, which would blow the rate budget.

### What does the aura ring mean?
Its thickness and brightness reflect the count of your most recent ~70 commits — a rough proxy for "how active were you lately." A dead week dims it; a heavy burst lights it up.

## ✦ Privacy & sharing

### Are shareable links safe to post publicly?
They contain your **public** GitHub data compressed into the URL hash. Anyone with the link can decompress and view it. The hash never touches a server (it's client-side only). Share links only to data you'd be comfortable showing on your GitHub profile — which, by definition, is all of it, since it's public.

### Can I delete the cached data?
Yes. Clear your browser's `localStorage` for the site, or open dev tools → Application → Local Storage → remove the `fed-temple:<username>` key.

### What about private repos?
Not supported yet. When PAT support ships, you'll paste a token that lives only in browser memory, fetches private data directly from `api.github.com`, and is never logged or transmitted elsewhere. See [SECURITY.md](SECURITY.md).

## ✦ Performance

### It's laggy with my huge profile.
The cap is 5,000 bricks rendered with `InstancedMesh`, which should hold 60fps on a 2020-era integrated GPU. If you still lag, try a desktop browser, close other tabs, or wait for adaptive LOD (roadmap).

### The temple didn't build / I got an error toast.
Common causes:
- **Rate-limited** — wait ~1 hour or use the demo. Check the "API: N calls left" chip.
- **Invalid username** — check spelling; the API returns 404 for nonexistent users.
- **Opening via `file://`** — ES module imports may fail. Serve with `python3 -m http.server`.

## ✦ Customization

### Can I change the colors?
The language→color map is in `scripts/temple.js` (`LANG_COLORS`). The theme is in `styles.css` (`:root` variables). Theme presets are on the roadmap.

### Can I embed my temple on my site?
Yes — use the **Save HTML** button to download a standalone file and host/embed it. An `<iframe>` snippet generator is a roadmap item.

### Can I 3D-print my temple?
Not yet. glTF/OBJ export is on the roadmap.
