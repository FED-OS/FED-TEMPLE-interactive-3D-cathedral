# Usage

A practical, copy-pasteable guide to using FED-TEMPLE.

## ✦ Build your temple

1. Open FED-TEMPLE in a browser (locally via `python3 -m http.server`, or on a hosted URL).
2. Enter your **GitHub username** in the input (defaults to `FED-OS`).
3. Click **⛏ Build Temple**.
4. Watch the progress bar mine your repos and forge bricks. First build takes a few seconds.
5. When done, you'll see your temple and a success toast.

## ✦ Explore

| Action | How |
|--------|-----|
| Rotate | Click-drag (or one-finger drag on touch) |
| Zoom | Scroll wheel (or pinch on touch) |
| Pan | Right-click-drag (or two-finger drag) |
| Reset camera | **🏠 Home** button, or press `R` |
| Auto-orbit | **🔄 Auto-Orbit** button — toggles a slow spin. Also auto-activates on load and after 30s idle |
| Inspect a brick | Click any brick → a modal pops up with the commit message, date, repo, and a link to the commit on GitHub |
| Filter languages | In the stats panel, click a language pill to dim that language's bricks (click again to restore) |
| Hide the UI | **👁 Hide UI** button, or press `H` — gives you a clean view |

## ✦ Share

### Shareable link
Click **🔗 Share**. The entire temple blueprint is compressed into the URL hash and copied to your clipboard. Paste it anywhere. Opening it renders the temple instantly — no API calls, no waiting. The hash is client-side only; no server ever sees it.

### Screenshot
Click **📸 Snapshot** (or press `S`). The UI hides for one frame, the canvas is captured, and a PNG downloads. Perfect for Twitter, LinkedIn, or your portfolio.

### Standalone HTML
Click **💾 Save HTML**. Downloads a self-contained `.html` file with your temple embedded. Open it offline, host it on your own site, or send it to a friend. No dependencies beyond the CDN.

## ✦ Demo mode

Click **✨ Demo** to build a temple from built-in sample data. Great for trying features without using your API quota. The app also auto-runs demo mode on first visit.

## ✦ Rate limits & caching

- The public GitHub API allows **60 requests/hour** per IP without a token.
- FED-TEMPLE fetches commits for your **top 5 repos by stars** and caps at **5,000 bricks** to stay within budget.
- After a successful build, the blueprint is cached in `localStorage` for **24 hours**. Refreshing the page re-renders from cache — zero API calls.
- Check the **"API: N calls left"** chip in the top-right corner.
- To clear the cache: dev tools → Application → Local Storage → delete `fed-temple:<username>`.

## ✦ Keyboard shortcuts

| Key | Action |
|-----|--------|
| `R` | Reset camera |
| `S` | Snapshot to PNG |
| `H` | Toggle UI overlay |

## ✦ Troubleshooting

- **Blank screen** — open dev console; ensure WebGL is enabled and you're on a current browser. Serve via `http://` not `file://`.
- **"GitHub API error 403"** — rate-limited. Wait ~1 hour or use demo mode.
- **"User not found"** — check the username spelling.
- **Laggy temple** — try a desktop browser; the 5,000-brick cap should hold 60fps on a 2020+ integrated GPU.

See [FAQ.md](FAQ.md) and [SUPPORT.md](SUPPORT.md) for more.

## ✦ Self-host

```bash
git clone https://github.com/FED-OS/FED-TEMPLE.git
cd FED-TEMPLE
python3 -m http.server 8000
# → http://localhost:8000
```

Or drop the folder on any static host. See [DEPLOYMENT.md](DEPLOYMENT.md).
