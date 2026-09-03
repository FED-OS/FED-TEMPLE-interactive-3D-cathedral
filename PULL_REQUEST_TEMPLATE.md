<!-- Thanks for building! Fill in every section. Keep PRs small: one concern per PR. -->

## ✦ What & why

<!-- What does this PR do, and why? Reference the issue/discussion if any. -->


## ✦ Ethos check

This PR does **not** introduce any of the following (check all to confirm):

- [ ] A required backend or database
- [ ] Required authentication / API keys for the default flow
- [ ] A build step, bundler, or transpiler
- [ ] Telemetry or analytics that phone home
- [ ] Auto-committing to users' repos
- [ ] A new dependency heavier than the job warrants
- [ ] `eval` or `innerHTML` with remote/user-controlled data

If any box is unchecked, explain why and how it's justified against [ADR-0001](../ADR.md).

## ✦ What changed

<!-- Bullet list of the meaningful changes. Skip trivial stuff. -->


## ✦ How to test

- [ ] `node --check scripts/temple.js` passes
- [ ] Served over `http://localhost:8000`, dev console is clean
- [ ] **Demo** mode builds a temple
- [ ] A real username builds a temple; stats populate; bricks rise; click-a-brick modal works
- [ ] Tested the affected feature specifically: <!-- describe -->
- [ ] Tested an empty/invalid username — friendly error, no crash
- [ ] Responsive check on a narrow viewport

## ✦ Docs updated

- [ ] [README.md](../README.md) if user-facing behavior changed
- [ ] [CHANGELOG.md](../CHANGELOG.md) entry added under **Unreleased**
- [ ] [ADR.md](../ADR.md) entry if this is a non-trivial architectural decision
- [ ] [usage.md](../usage.md) / [FAQ.md](../FAQ.md) if relevant

## ✦ Performance

- [ ] Temple still holds ~60fps at 5,000 bricks (profiled if rendering changed)
- [ ] No new network calls beyond `api.github.com` (and CDN for libs)

## ✦ Screenshots / recordings

<!-- If visual, drop a screenshot or GIF. -->


<!-- Conventional Commits title, e.g.: feat: add time-lapse slider -->
