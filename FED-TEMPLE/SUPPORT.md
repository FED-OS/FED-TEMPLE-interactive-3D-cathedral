# Support

## ✦ Before you ask

1. Read the [README.md](README.md) — especially the **Rate limits** and **Quick start** sections.
2. Check the [FAQ.md](FAQ.md).
3. Search existing [Issues](https://github.com/FED-OS/FED-TEMPLE/issues) and [Discussions](https://github.com/FED-OS/FED-TEMPLE/discussions).

## ✦ Where to get help

| Channel | Use it for |
|---------|-----------|
| [Discussions](https://github.com/FED-OS/FED-TEMPLE/discussions) | Questions, ideas, show-and-tell, "how do I…" |
| [Issues](https://github.com/FED-OS/FED-TEMPLE/issues) | Bugs, concrete feature requests |
| [security@fed-os.dev](mailto:security@fed-os.dev) | Security vulnerabilities only — see [SECURITY.md](SECURITY.md) |

## ✦ Filing a good bug report

Use the **bug report** issue template and include:

- What you did (username entered, button clicked, steps in order)
- What you expected
- What actually happened (copy the toast message verbatim)
- Your browser + OS + version
- The contents of the dev console (copy-paste, redact nothing sensitive — there shouldn't be anything sensitive)
- Whether you were rate-limited (check the "API: N calls left" chip in the top-right)
- A screenshot or screen recording if it's visual

## ✦ Filing a good feature request

Use the **feature request** template and explain:

- The problem you're trying to solve (not just the solution you imagine)
- How it fits the **browser-native, no-bullshit** ethos
- A rough sketch of the data flow and UI
- Whether you're willing to build it

## ✦ Response times

This is a community project maintained by a small team. We read issues and discussions regularly but we don't promise SLAs. PRs that fix bugs or ship agreed features move faster than open-ended requests.

## ✦ Self-help quick fixes

- **"Nothing renders / blank screen"** — open the dev console. WebGL may be disabled or your browser may be too old. Try Chrome or Firefox current. If you see a CORS error, you may be opening `index.html` via `file://` — serve it with `python3 -m http.server` instead.
- **"Rate limit hit"** — wait ~1 hour, or clear the cache and use the demo button meanwhile. The 24h `localStorage` cache means a refresh after a successful build won't cost API calls.
- **"Temple is huge and lags"** — FED-TEMPLE caps at 5,000 bricks. If you're still lagging, lower your browser's resolution scale or try a desktop browser. We're working on adaptive LOD.
- **"My commits aren't all there"** — by design, we mine the **top 5 repos by stars** to stay within rate limits. See the README. Full-repo mining is a roadmap item gated behind optional PAT support.
