# Governance

## ✦ Philosophy

FED-TEMPLE is a small, opinionated project. It does not need a parliament. It needs a maintainer with taste and a community that respects the [ethos](CONTRIBUTING.md#the-ethos): browser-native, no bullshit, brutalist clarity.

This document describes how decisions are made and how the project is stewarded — lightly.

## ✦ Roles

### Maintainers
Maintainers have commit access to the repository. They are responsible for:

- Triage and labeling issues and PRs
- Reviewing and merging contributions
- Guarding the ethos (rejecting scope creep, dependency sprawl, telemetry)
- Cutting releases and writing the changelog
- Keeping the `main` branch green

Maintainers are added by nomination from an existing maintainer and a lazy-consensus period of one week (see below). Maintainers can step down at any time. A maintainer who is inactive for 6+ months may be moved to emeritus status (no loss of credit, just no active commit access).

### Contributors
Anyone who opens a PR that merges is a contributor. Contributors are listed in [AUTHORS.md](AUTHORS.md). There is no barrier to becoming one beyond writing code that fits the project.

### Users
Everyone else. Users shape the project by filing issues, starting discussions, and sharing their temples. Their feedback is the most important signal we have.

## ✦ Decision making

### Lazy consensus
For most day-to-day decisions (bug fixes, small features, dependency bumps, docs), a maintainer proposes, and if no one objects within a reasonable window (typically 72 hours for PRs, one week for process changes), it proceeds. Silence is consent.

### Explicit consensus for the big stuff
Changes to the following require explicit agreement from all active maintainers (and, for breaking changes, a public Discussion with at least one week of community input):

- The license
- The ethos (the three rules in [CONTRIBUTING.md](CONTRIBUTING.md))
- A build step or bundler (we are deliberately build-free)
- A required backend or required authentication for the default experience
- Telemetry or analytics that phone home
- The max-bricks cap or the rate-limit strategy (these are load-bearing design constraints)

### When maintainers disagree
We talk it out in a Discussion or a maintainer call. If consensus can't be reached, the founder (the original FED-OS maintainer) holds the tie-breaking vote on matters of project direction. Technical implementation details default to the maintainer doing the work.

## ✦ The ethos as a hard gate

No governance process can override the ethos. If a proposal — however popular — violates "browser-native, no bullshit, brutalist clarity," it is rejected. The ethos is the constitution; everything else is statute.

## ✦ Transparency

- All decisions happen in public (issues, PRs, Discussions). No back-channel deals.
- Release notes are in [CHANGELOG.md](CHANGELOG.md).
- Architecture decisions are recorded in [ADR.md](ADR.md).
- The roadmap is public in [ROADMAP.md](ROADMAP.md) and changes are announced in Discussions.

## ✦ Conflict resolution

1. Assume good faith.
2. Take it to a Discussion, not a flame war in a PR.
3. If behavior violates the [Code of Conduct](CODE_OF_CONDUCT.md), follow the CoC enforcement process, not this document.
4. Technical disputes that can't resolve through discussion defer to "the maintainer who ships the code gets the call, reversibly" — it's easier to merge a working PR and iterate than to deadlock.

## ✦ Project continuity

If all maintainers become permanently unavailable, the project enters a **stewardship call** period: a public Discussion is opened inviting new maintainers. After 30 days with no successor, the repo is archived in a readable state. The MIT License ensures it can always be forked and continued by anyone, regardless of what happens to the original organization.

## ✦ Amendments

This document is amended by lazy consensus among maintainers, with a one-week public comment window in Discussions. Significant structural changes (adding/removing roles, changing the tie-break rule) require explicit maintainer consensus.
