# Phase 11: Show Individual Repo Projects in the Temple

## Goal
Instead of blending all repos' commits into one interleaved mass, build a
SEPARATE mini-pyramid/tower per repo. Each project = its own visible structure.
User can see at a glance: how many projects, which are big, which are small,
what languages each uses.

## Tasks
- [x] Design multi-pyramid layout: arrange N repo pyramids in a ring around center
- [x] Refactor buildBricks to build one small pyramid per repo (not one big temple)
- [x] Each repo pyramid sized by its commit count, colored by that repo's languages
- [x] Keep InstancedMesh approach (one big instanced mesh, positions span all pyramids)
- [x] Keep raycasting/drag/tree-panel working (positions array still carries commit data)
- [x] Keep golden tiles + pillars + stained glass (they use blueprint-level stats, not commits)
- [x] Scale dais/ground to fit the multi-pyramid spread (camera pulled back, orbit radius 38)
- [x] Update demo data to have distinct repos with different sizes
- [x] Test on FED-OS real data — 12 pyramids, one per repo
- [x] Screenshot to confirm visual — multiple distinct pyramids visible
- [x] Verify double-click repo tree still works with multi-pyramid layout
- [x] Update SNAPTIME_INLINE snapshot code to use multi-pyramid layout too
- [x] Remove debug exports
- [x] Deploy
