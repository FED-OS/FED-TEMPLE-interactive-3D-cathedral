# Security Policy

## ✦ Supported versions

FED-TEMPLE is a static, client-side application. We support the latest `main` branch and the most recent tagged release. Old versions receive security fixes only if a critical issue is reported.

| Version | Supported |
|---------|-----------|
| latest `main` | ✅ |
| latest release tag | ✅ |
| older tags | ❌ |

## ✦ Reporting a vulnerability

**Do not open a public issue for security problems.**

Email **security@fed-os.dev** (replace with your real address) with:

1. A description of the issue and its impact
2. Steps to reproduce, including any HTML/JS PoC
3. The affected version or commit SHA
4. Your suggested fix (optional but appreciated)

We acknowledge reports within **48 hours** and aim to ship a fix or mitigation within **7 days** for high-severity issues. Please do not disclose the vulnerability publicly until we have released a fix.

## ✦ Security posture

FED-TEMPLE is designed to be safe-by-default:

- **No backend.** The entire app runs in your browser. There is no server to compromise.
- **No secrets by default.** It uses the public GitHub API with no token. Nothing sensitive is transmitted.
- **CORS-respecting.** It only calls `api.github.com`, which explicitly allows browser-origin requests.
- **Client-side only for any future token support.** If/when Personal Access Token (PAT) support ships, the token will live only in browser memory / `sessionStorage`, never be sent anywhere except `api.github.com`, and never be logged.
- **No `eval`, no `innerHTML` of remote data.** Commit messages are inserted via `textContent`, preventing XSS from malicious commit messages.
- **CDN dependencies** are pinned to specific versions (`three@0.160.0`, `lz-string@1.5.0`) to prevent supply-chain drift. Verify the integrity of these CDNs if you fork.

## ✦ Known considerations

- **Rate-limit headers** from GitHub are read and displayed in the UI credit chip. This is informational only.
- **Downloaded standalone HTML** files embed your public GitHub data. They contain no secrets but do contain your commit history — share them as you would share your GitHub profile.
- **Shareable links** compress your public blueprint into the URL hash. The hash is never sent to any server (it's client-side only), but anyone with the link can decompress and view the data. Only share links to data you're comfortable making public.

## ✦ Hardening checklist for forks

If you deploy your own instance:

- Serve over HTTPS.
- Add a `Content-Security-Policy` header allowing `script-src` from `cdn.jsdelivr.net` (for Three.js/lz-string) and `img-src` from `ko-fi.com` (for the support button) plus `'self'`.
- Pin CDN versions (already done) and consider Subresource Integrity if you self-host the libraries.
- Set `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
