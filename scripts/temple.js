/* ===================================================================
   FED-TEMPLE — temple.js
   The Digital Monument — core engine
   -------------------------------------------------------------------
   Phase 9: Performance, color diversity, declutter, UI reduction.
     • Shadows OFF, pixel ratio capped at 1, antialias OFF
     • Single sun light + ambient (no dynamic PointLights)
     • Golden tiles + pillars INSTANCED (one draw call each)
     • Ghosts, lanterns, aura, grid, staircase REMOVED (pointless clutter)
     • Commits INTERLEAVED by repo round-robin so colors spread throughout
       the temple instead of forming solid color bands ("poorly colored pyramid")
     • animate() loop stripped to camera + controls + render only
   =================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// lz-string is loaded as a classic <script> in index.html and exposes the
// global `LZString`. (The CDN build has no ESM default export, so importing it
// as a module throws and kills the app before boot.) Keep using the global.
const LZString = window.LZString;

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const MAX_BRICKS = 5000;       // hard cap so the browser doesn't die
const MAX_REPOS_FOR_COMMITS = 12; // mine more repos for richer color diversity
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h localStorage cache
const IDLE_ORBIT_MS = 30000;   // resume auto-orbit after this idle
const INITIAL_ORBIT_MS = 10000; // auto-orbit on first build

// GitHub language → hex color. Several official linguist colors are too dark
// to read against our #0d1117 background with flat lighting (Python #3572A5,
// C #555555, CSS #563d7c, PHP #4F5D95 all look near-black). We brighten those
// to a lighter shade of the same hue so every language is clearly visible.
const LANG_COLORS = {
  JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#4B8BBE',
  HTML:'#e34c26', CSS:'#8B5CF6', Shell:'#89e051', Rust:'#dea584',
  Go:'#00ADD8', Java:'#b07219', C:'#8B8B8B', 'C++':'#f34b7d',
  'C#':'#178600', Ruby:'#701516', PHP:'#7B8AB8', Vue:'#41b883',
  Svelte:'#ff3e00', Dockerfile:'#384d54', Makefile:'#427819',
  Kotlin:'#A97BFF', Swift:'#F05138', Dart:'#00B4AB',
  Lua:'#5C5CE0', Rascal:'#ff7036', Unknown:'#888888'
};
const langColor = (l) => LANG_COLORS[l] || '#888888';

// ------------------------------------------------------------------
// DOM refs
// ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = $('ui'), usernameInput = $('username'), buildBtn = $('buildBtn'),
      demoBtn = $('demoBtn'), cancelBtn = $('cancelBtn'), toggleUi = $('toggleUi'),
      progressWrap = $('progress-wrap'), progressText = $('progress-text'),
      progressFill = $('progress-fill'), statsEl = $('stats'),
      toastEl = $('toast'), modalEl = $('modal'), modalMsg = $('modalMsg'),
      modalRepo = $('modalRepo'), modalDate = $('modalDate'),
      modalLink = $('modalLink'), modalClose = $('modalClose'),
      langPills = $('lang-pills'),
      asciiLoader = $('ascii-loader'), asciiArt = $('ascii-art'),
      asciiStatus = $('ascii-status'),
      treePanel = $('tree-panel'), treeBody = $('treeBody'),
      treeRepoName = $('treeRepoName'), treeSub = $('treeSub'),
      treeLink = $('treeLink'), treeClose = $('treeClose'),
      toggleTreeBtn = $('toggleTree'), hintEl = $('hint');

// rate-info was removed in the Phase 8 UI slim; keep a nullable ref so
// updateRateLimit() can no-op gracefully without a ReferenceError.
const rateInfo = $('rate-info');   // null in current UI

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
let abortCtrl = null;
let scene, camera, renderer, controls, raycaster, pointer, clock;
let brickGroup, tileGroup, pillarGroup, glassGroup, ghostGroup;
let templeState = null;        // { blueprint, dimmedLangs:Set }
let lastInteraction = Date.now();
let autoOrbitOn = false;

// ---- brick drag state (Phase 8) ----
let drag = null;               // active drag session or null
// drag = { id, startX, startY, moved, plane, hitPoint, brickY }
const DRAG_THRESHOLD = 6;      // px before we consider it a drag, not a click
let lastBrickRepo = null;      // repo name of the most-recently-touched brick (Tree button)

// ==================================================================
// UTILITIES
// ==================================================================
function showToast(msg, kind = 'error', ms = 4000) {
  toastEl.textContent = msg;
  toastEl.className = 'show' + (kind === 'ok' ? ' ok' : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toastEl.className = ''; }, ms);
}

function setProgress(msg, pct) {
  progressWrap.classList.add('active');
  progressText.textContent = msg;
  if (pct != null) progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

function setButtons(building) {
  buildBtn.disabled = building;
  demoBtn.disabled = building;
  cancelBtn.disabled = !building;
}

// Hint badge: show the drag/dblclick tip briefly after each build.
function showHint() {
  hintEl.classList.add('show');
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => hintEl.classList.remove('show'), 7000);
}

// ==================================================================
// ASCII LOADER  (Hidden Gem #8)
// ==================================================================
const ASCII_FRAMES = [
`        |       
       /|\\      
      / | \\     
     /  |  \\    
    /___|___\\   `,
`        |       
       /|\\      
      / | \\     
     /  |  \\    
    /___|___\\   
   [   FED   ]  `,
`        |       
       /|\\      
      / | \\     
     /  |  \\    
    /___|___\\   
   [ FED-TMP ]  
  [  forging  ] `
];
let asciiIdx = 0;
function startAscii() {
  asciiLoader.classList.remove('hide');
  asciiIdx = 0;
  clearInterval(startAscii._t);
  startAscii._t = setInterval(() => {
    asciiArt.textContent = ASCII_FRAMES[asciiIdx % ASCII_FRAMES.length];
    asciiIdx++;
  }, 350);
}
function stopAscii() {
  clearInterval(startAscii._t);
  asciiLoader.classList.add('hide');
}

// ==================================================================
// DATA HARVESTER  (MVP 1,2,3 + GEM rate-limit display + cache)
// ==================================================================
async function fetchAllData(username, onProgress, signal) {
  const cacheKey = 'fed-temple:' + username.toLowerCase();
  // ---- cache check ----
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts < CACHE_TTL_MS) {
        onProgress('Loaded from cache (24h).', 100);
        return cached.data;
      }
    }
  } catch (_) {}

  const api = (path) => `https://api.github.com${path}`;

  // ---- user ----
  onProgress('Fetching user profile…', 2);
  let r = await fetch(api(`/users/${username}`), { signal });
  updateRateLimit(r);
  if (r.status === 404) throw new Error(`User "${username}" not found.`);
  if (r.status === 403) throw new Error('GitHub rate limit hit. Wait ~1 hour or use a token. (Cached data may still work.)');
  if (!r.ok) throw new Error(`GitHub API error ${r.status}.`);
  const user = await r.json();

  // ---- repos ----
  onProgress('Fetching repositories…', 8);
  r = await fetch(api(`/users/${username}/repos?per_page=100&sort=pushed`), { signal });
  updateRateLimit(r);
  if (!r.ok) throw new Error(`Could not fetch repos (${r.status}).`);
  let repos = await r.json();
  if (!Array.isArray(repos)) repos = [];

  // paginate if exactly 100 (there may be more)
  let page = 2;
  while (repos.length && repos.length % 100 === 0 && page <= 10) {
    const r2 = await fetch(api(`/users/${username}/repos?per_page=100&sort=pushed&page=${page}`), { signal });
    if (!r2.ok) break;
    const more = await r2.json();
    if (!more.length) break;
    repos = repos.concat(more);
    if (more.length < 100) break;
    page++;
  }

  // ---- aggregate stars / forks / languages ----
  let totalStars = 0, totalForks = 0, totalIssues = 0, totalPRs = 0;
  const langBytes = {};
  const contributorMap = {};
  repos.forEach(repo => {
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;
    totalIssues += repo.open_issues_count || 0;
    if (repo.language) {
      langBytes[repo.language] = (langBytes[repo.language] || 0) + (repo.size || 0);
    }
  });

  // ---- commits (repos chosen for LANGUAGE DIVERSITY, not just stars) ----
  // The user's #1 complaint was the "poorly colored pyramid" — mining only
  // the top-5 star repos meant one dominant language flooded the temple.
  // Now we pick repos to maximize language coverage: for each distinct
  // language we take the highest-star repo of that language first, then fill
  // remaining slots with more repos (star-sorted). This guarantees every
  // language the user writes gets represented in the brick colors.
  const reposByLang = {};        // lang → best repo (most stars)
  repos.forEach(repo => {
    const lang = repo.language || 'Unknown';
    const prev = reposByLang[lang];
    if (!prev || (repo.stargazers_count || 0) > (prev.stargazers_count || 0)) {
      reposByLang[lang] = repo;
    }
  });
  // one best repo per language, star-sorted
  const diversityRepos = Object.values(reposByLang)
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
  // remaining repos (star-sorted) to fill out to MAX_REPOS_FOR_COMMITS
  const diversityNames = new Set(diversityRepos.map(r => r.name));
  const fillRepos = repos
    .filter(r => !diversityNames.has(r.name))
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
  const topRepos = [...diversityRepos, ...fillRepos].slice(0, MAX_REPOS_FOR_COMMITS);

  // Collect commits grouped per-repo so we can INTERLEAVE them later.
  // Round-robin interleaving spreads each repo's language color across the
  // whole temple instead of clustering one repo's bricks into a single band.
  const perRepo = [];   // array of arrays: perRepo[i] = commits of repo i
  for (let i = 0; i < topRepos.length; i++) {
    const repo = topRepos[i];
    onProgress(`Mining commits: ${repo.name} (${i + 1}/${topRepos.length})`,
               10 + (i / topRepos.length) * 80);
    const bucket = [];
    let p = 1, got = 0;
    while (got < 500 && (perRepo.reduce((a, b) => a + b.length, 0) + bucket.length) < MAX_BRICKS) {
      try {
        const cr = await fetch(
          api(`/repos/${username}/${repo.name}/commits?per_page=100&page=${p}`),
          { signal });
        if (!cr.ok) break;
        const data = await cr.json();
        if (!data.length) break;
        data.forEach(c => {
          const author = c.commit.author ? c.commit.author.name : 'unknown';
          contributorMap[author] = (contributorMap[author] || 0) + 1;
          bucket.push({
            m: (c.commit.message || '').split('\n')[0].slice(0, 160),
            d: c.commit.author ? c.commit.author.date : '',
            lang: repo.language || 'Unknown',
            repo: repo.name,
            sha: c.sha || ''
          });
        });
        got += data.length;
        p++;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        break; // repo may be empty / forbidden; skip
      }
    }
    // sort each repo's commits chronologically (oldest first) before interleaving
    bucket.sort((a, b) => new Date(a.d) - new Date(b.d));
    perRepo.push(bucket);
    if (perRepo.reduce((a, b) => a + b.length, 0) >= MAX_BRICKS) break;
  }

  // ---- INTERLEAVE commits round-robin across repos ----
  // This is the fix for the "poorly colored pyramid": instead of pouring
  // repo1's commits, then repo2's, ... (which clusters same-language bricks
  // into solid color bands), we take one commit from each repo in turn. The
  // result is that every layer of the temple contains a mix of repos/languages,
  // so the structure reads as a rich, multi-colored monument rather than a
  // monochrome pyramid. We still keep a rough chronological tendency because
  // each bucket is internally sorted and we pull from the front.
  const allCommits = [];
  const totalCollected = perRepo.reduce((a, b) => a + b.length, 0);
  const targetCount = Math.min(totalCollected, MAX_BRICKS);
  const cursors = perRepo.map(() => 0);
  let placed = 0;
  while (placed < targetCount) {
    let advanced = false;
    for (let i = 0; i < perRepo.length; i++) {
      if (cursors[i] < perRepo[i].length) {
        allCommits.push(perRepo[i][cursors[i]]);
        cursors[i]++;
        placed++;
        if (placed >= targetCount) break;
        advanced = true;
      }
    }
    if (!advanced) break; // all buckets exhausted
  }

  // ---- Build per-repo commit groups for multi-pyramid layout ----
  // Each repo becomes its own visible mini-pyramid in the scene.
  // We keep the flat allCommits array for backwards-compat (snapshot, stats)
  // but also pass grouped data so buildBricks can lay out one pyramid per repo.
  const repoGroups = [];
  for (let i = 0; i < perRepo.length; i++) {
    if (perRepo[i].length === 0) continue;
    repoGroups.push({
      name: topRepos[i] ? topRepos[i].name : `repo${i}`,
      commits: perRepo[i]
    });
  }
  // Sort repos by commit count desc so the biggest pyramid is at center-front
  repoGroups.sort((a, b) => b.commits.length - a.commits.length);

  const blueprint = {
    user: { login: user.login, name: user.name || user.login, avatar: user.avatar_url },
    repoCount: repos.length,
    totalCommits: allCommits.length,
    commits: allCommits.slice(0, MAX_BRICKS),
    repoGroups,
    totalStars, totalForks, totalIssues, totalPRs,
    languages: langBytes,
    contributors: Object.entries(contributorMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([name, count]) => ({ name, count }))
  };

  // ---- cache it ----
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: blueprint }));
  } catch (_) { /* quota */ }

  onProgress('Blueprint forged.', 100);
  return blueprint;
}

function updateRateLimit(resp) {
  if (!rateInfo) return;       // element removed in Phase 8 UI slim — no-op
  const rem = resp.headers.get('X-RateLimit-Remaining');
  const reset = resp.headers.get('X-RateLimit-Reset');
  if (rem != null) {
    let txt = `API: ${rem} calls left`;
    if (reset) {
      const mins = Math.max(0, Math.round((reset * 1000 - Date.now()) / 60000));
      if (Number(rem) < 10) txt += ` · resets in ${mins}m`;
    }
    rateInfo.textContent = txt;
  }
}

// ==================================================================
// DEMO DATA  (MVP 9)
// ==================================================================
function demoBlueprint() {
  const langs = ['JavaScript','TypeScript','Python','Rust','HTML','CSS','Shell'];
  // Demo repos with different sizes to showcase multi-pyramid layout.
  // Biggest repo (monolith) will be at center, rest in a ring around it.
  const demoRepos = [
    { name: 'monolith', count: 180, lang: 'JavaScript' },
    { name: 'oracle',   count: 90,  lang: 'Python' },
    { name: 'sigil',    count: 55,  lang: 'TypeScript' },
    { name: 'forge',    count: 40,  lang: 'Rust' },
    { name: 'ashes',    count: 25,  lang: 'HTML' }
  ];
  const commits = [];
  const now = Date.now();
  const repoGroups = demoRepos.map((repo, ri) => {
    const repoCommits = [];
    for (let i = 0; i < repo.count; i++) {
      const c = {
        m: ['feat: add module','fix: edge case','docs: readme','refactor: cleanup','chore: deps','init: scaffold','perf: optimize','style: format'][i % 8],
        d: new Date(now - (repo.count - i) * 86400000 * 3).toISOString(),
        lang: langs[(ri + i) % langs.length],
        repo: repo.name,
        sha: (i * 9999 + ri * 7777).toString(16).padStart(7, '0')
      };
      repoCommits.push(c);
      commits.push(c);
    }
    return { name: repo.name, commits: repoCommits };
  });
  return {
    user: { login: 'demo', name: 'Demo Builder', avatar: '' },
    repoCount: demoRepos.length,
    totalCommits: commits.length,
    commits,
    repoGroups,
    totalStars: 42, totalForks: 9, totalIssues: 3, totalPRs: 17,
    languages: { JavaScript:120, TypeScript:80, Python:60, Rust:40, HTML:30, CSS:20, Shell:10 },
    contributors: [
      { name:'demo', count:300 },{ name:'ghost1', count:80 },
      { name:'phantom', count:40 }
    ]
  };
}

// ==================================================================
// SCENE SETUP  (Phase 9: stripped for performance)
//   • No shadows (biggest GPU win — removes 2048² shadow pass entirely)
//   • Pixel ratio capped at 1 (retina 2× = 4× the fragment work)
//   • Antialias OFF (use a light FXAA-free approach; edges fine at dpr 1)
//   • One DirectionalLight + AmbientLight only (no dynamic PointLights)
//   • No fog, no grid, no staircase, no lanterns — all removed as clutter
// ==================================================================
function initScene() {
  const container = $('canvas-container');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(26, 18, 34);

  // PERFORMANCE: cap pixel ratio at 1. On retina (dpr=2) this cuts fragment
  // shader work by 4×. The visual difference is negligible at this geometry
  // density and totally worth the smoothness.
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 2, 0);
  controls.maxDistance = 120;
  controls.minDistance = 5;
  controls.maxPolarAngle = Math.PI * 0.495; // don't go under floor

  // lights — just two static lights, no shadow casting
  scene.add(new THREE.AmbientLight(0x556070, 0.85));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.25);
  sun.position.set(20, 34, 16);
  scene.add(sun);

  // ground — single disc, no shadow receiving
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(70, 48),
    new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.92, metalness: 0.04 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // sacred floor inlay: a lighter stone disc the temple sits on
  const dais = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.8, metalness: 0.1 })
  );
  dais.rotation.x = -Math.PI / 2;
  dais.position.y = 0.015;
  scene.add(dais);

  // groups
  brickGroup = new THREE.Group(); scene.add(brickGroup);
  tileGroup = new THREE.Group(); scene.add(tileGroup);
  pillarGroup = new THREE.Group(); scene.add(pillarGroup);
  glassGroup = new THREE.Group(); scene.add(glassGroup);
  ghostGroup = new THREE.Group(); scene.add(ghostGroup);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();

  // DEBUG export for verification (Phase 9)


  // events — pointer state machine handles click vs hold-drag vs dblclick
  addEventListener('resize', onResize);
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', onPointerUp);
  cv.addEventListener('dblclick', onCanvasDblClick);
  controls.addEventListener('start', () => { lastInteraction = Date.now(); autoOrbitOn = false; });

  animate();
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ==================================================================
// TEMPLE FORGE
// ==================================================================
function clearTemple() {
  [brickGroup, tileGroup, pillarGroup, glassGroup, ghostGroup].forEach(g => {
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose?.();
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material?.dispose?.();
    }
  });
}

function buildTemple(bp) {
  clearTemple();
  templeState = { blueprint: bp, dimmedLangs: new Set() };
  renderStats(bp);
  renderLangPills(bp);

  const hasCommits = bp.commits && bp.commits.length > 0;

  if (hasCommits) {
    buildBricks(bp.commits, bp.repoGroups);  // MVP 4: animated, multi-pyramid
    buildGoldenTiles(bp.totalStars);
    buildPillars(bp.totalForks);
    buildStainedGlass(bp.languages);
    enableInitialOrbit();
  } else {
    buildRuins();                      // GEM: empty-state ruins
    showToast('No commits found — summoning the fallen ruins.', 'ok', 5000);
  }
}

// ---- BRICKS (animated queue) — ONE MINI-PYRAMID PER REPO ----
// Instead of blending all repos into one giant temple, each repo gets its own
// visible step-pyramid. Pyramids are arranged in a ring around the center,
// sized proportional to commit count. The biggest repo is placed at center-
// front. This lets you SEE the individual projects — how many, how big, and
// what languages each one uses — at a glance.
// Bricks within each pyramid are colored by the commit's language.
function buildBricks(commits, repoGroups) {
  const bw = 0.82, bh = 0.42, bd = 0.82, gap = 0.05;
  const sx = bw + gap, sz = bd + gap; // stride per brick

  // ---- Determine per-repo pyramid plans + ring positions ----
  // If we don't have repoGroups (e.g. loaded from old snapshot), fall back to
  // grouping commits by repo.name ourselves.
  let groups = repoGroups;
  if (!groups || groups.length === 0) {
    const byRepo = {};
    commits.forEach(c => {
      const r = c.repo || 'unknown';
      if (!byRepo[r]) byRepo[r] = { name: r, commits: [] };
      byRepo[r].commits.push(c);
    });
    groups = Object.values(byRepo).sort((a, b) => b.commits.length - a.commits.length);
  }

  // ---- Build a flat slot list spanning ALL pyramids ----
  // Each slot carries an absolute (x,z) position in world space + the commit
  // it belongs to. One InstancedMesh covers everything.
  const allSlots = [];   // {x, z, course, rotY, commit}
  const pyramidMeta = []; // {name, cx, cz, baseSize, topY} for camera/labels

  const ringSpacing = computeRingSpacing(groups.length);
  const positions3D = computePyramidPositions(groups.length, ringSpacing);

  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const repoCommits = grp.commits;
    if (repoCommits.length === 0) continue;

    const pos = positions3D[gi];
    // Size the pyramid base to balance width vs height. With inset=1, a base
    // of B stacks ~B/2 courses. We want 3-6 courses for a good pyramid shape,
    // so base ≈ sqrt(commits * 0.5) gives that balance.
    const cc = repoCommits.length;
    const baseCols = Math.min(13, Math.max(5, Math.round(Math.sqrt(cc * 0.5))));

    const plan = planMiniPyramid(baseCols, cc, sx, sz);
    const useCount = Math.min(plan.length, cc);

    let topY = 0;
    for (let i = 0; i < useCount; i++) {
      const slot = plan[i];
      const c = repoCommits[i];
      const stagger = (slot.course % 2 === 1) ? sx / 2 : 0;
      const x = pos.x + slot.x + stagger;
      const z = pos.z + slot.z;
      const y = bh / 2 + slot.course * (bh + gap);
      if (y > topY) topY = y;
      allSlots.push({ x, z, course: slot.course, rotY: slot.rotY || 0, commit: c, y });
    }
    pyramidMeta.push({ name: grp.name, cx: pos.x, cz: pos.z, baseSize: baseCols, topY });
  }

  const useCount = allSlots.length;
  if (useCount === 0) return;

  // ---- Build the instanced mesh ----
  const geo = new THREE.BoxGeometry(bw, bh, bd);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.06 });
  const inst = new THREE.InstancedMesh(geo, mat, useCount);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  brickGroup.add(inst);

  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(useCount * 3), 3);
  inst.instanceColor = colorAttr;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const positions = []; // for raycasting + userData + animation

  for (let i = 0; i < useCount; i++) {
    const s = allSlots[i];
    const c = s.commit;
    positions.push({ x: s.x, z: s.z, y: -10, targetY: s.y, rotY: s.rotY, commit: c, index: i });
    color.set(langColor(c.lang));
    colorAttr.setXYZ(i, color.r, color.g, color.b);

    dummy.position.set(s.x, -10, s.z);
    dummy.rotation.set(0, s.rotY, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.count = useCount;
  inst.instanceMatrix.needsUpdate = true;
  colorAttr.needsUpdate = true;
  brickGroup._inst = inst;
  brickGroup._positions = positions;
  brickGroup._pyramids = pyramidMeta;

  // ---- Animate the rise ----
  animateBrickRise(positions, inst);
}

// Compute spacing between pyramids based on how many there are.
// Few repos → spread out; many repos → pack tighter.
function computeRingSpacing(groupCount) {
  if (groupCount <= 1) return 0;
  if (groupCount <= 4) return 16;
  if (groupCount <= 8) return 14;
  return 12;
}

// Arrange N pyramids in world space. The biggest (index 0) goes at center.
// The rest form a ring around it. Returns [{x, z}, ...] for each group index.
function computePyramidPositions(n, spacing) {
  const positions = [];
  if (n <= 1) {
    positions.push({ x: 0, z: 0 });
    return positions;
  }
  // Index 0 (biggest repo) at center
  positions.push({ x: 0, z: 0 });
  // Remaining repos in a ring around center
  const ringCount = n - 1;
  for (let i = 0; i < ringCount; i++) {
    const angle = (i / ringCount) * Math.PI * 2;
    positions.push({ x: Math.cos(angle) * spacing, z: Math.sin(angle) * spacing });
  }
  return positions;
}

// Plan a single mini step-pyramid: keep stacking courses, each one smaller
// than the last, until we've placed enough slots for all the repo's commits.
// This creates a proper pyramid shape that gets taller for repos with more
// commits. Returns flat list of {x, z, course, rotY}.
function planMiniPyramid(baseCols, commitCount, sx, sz) {
  const slots = [];
  let course = 0;
  let cols = baseCols;
  let rows = baseCols; // square base
  const tierInset = 1; // shrink each course by 1 brick per side → taller pyramids

  // Keep stacking courses until we have enough slots or the pyramid tops out.
  // Each course is a solid rectangle, smaller than the one below it.
  while (cols >= 3 && rows >= 3) {
    const ox = -(cols - 1) / 2 * sx;
    const oz = -(rows - 1) / 2 * sz;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({ x: ox + c * sx, z: oz + r * sz, course, rotY: 0 });
      }
    }
    // Stop if we have enough slots for this repo's commits
    if (slots.length >= commitCount) break;
    course++;
    cols -= tierInset * 2;
    rows -= tierInset * 2;
  }

  return slots;
}

// Animate the brick rise. To avoid O(n) per-frame work over ALL bricks for the
// entire animation, we only update the "active window" of bricks each frame:
// those that have started rising but haven't reached their target yet. Bricks
// that have settled are skipped entirely. This keeps per-frame cost bounded.
function animateBrickRise(positions, inst) {
  const dummy = new THREE.Object3D();
  const perFrame = Math.max(6, Math.ceil(positions.length / 90)); // ~1.5s build
  let cursor = 0;
  const active = []; // indices currently animating upward

  function step() {
    // start a new batch rising
    const target = Math.min(cursor + perFrame, positions.length);
    for (; cursor < target; cursor++) {
      active.push(cursor);
    }

    // animate only active bricks toward targetY; drop settled ones
    for (let i = active.length - 1; i >= 0; i--) {
      const idx = active[i];
      const p = positions[idx];
      p.y += (p.targetY - p.y) * 0.18;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rotY || 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      if (Math.abs(p.y - p.targetY) <= 0.01) {
        p.y = p.targetY;
        active.splice(i, 1);
      }
    }
    inst.instanceMatrix.needsUpdate = true;

    if (active.length || cursor < positions.length) {
      requestAnimationFrame(step);
    }
  }
  step();
}

// ---- GOLDEN TILES (stars) — INSTANCED for one draw call ----
// Was: up to 250 separate Mesh+Material instances (250 draw calls).
// Now: a single InstancedMesh with per-instance color (one draw call).
function buildGoldenTiles(stars) {
  const n = Math.min(stars, 250);
  if (n === 0) return;
  const geo = new THREE.CircleGeometry(0.34, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // tinted per-instance below
    emissive: 0xffaa00, emissiveIntensity: 0.45,
    roughness: 0.3, metalness: 0.7,
    side: THREE.DoubleSide
  });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  const gold = new THREE.Color(0xffd700);
  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  for (let i = 0; i < n; i++) {
    const angle = i * 2.39996; // golden angle
    const radius = 17 + Math.sqrt(i) * 1.6;
    dummy.position.set(Math.cos(angle) * radius, 0.03, Math.sin(angle) * radius);
    dummy.rotation.set(-Math.PI / 2, 0, angle);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    colorAttr.setXYZ(i, gold.r, gold.g, gold.b);
  }
  inst.instanceColor = colorAttr;
  inst.userData = { kind: 'tiles' };
  tileGroup.add(inst);
  tileGroup._inst = inst;
}

// ---- PILLARS (forks) — INSTANCED for one draw call ----
// Was: up to 24 pillars × 2 meshes (pillar + capital) = 48 draw calls.
// Now: a single InstancedMesh (one draw call). Capitals folded into the same
// cylinder by just making the pillar slightly taller — visually equivalent at
// this scale and far cheaper.
function buildPillars(forks) {
  const n = Math.min(Math.max(forks, 0), 24);
  if (n === 0) return;
  const geo = new THREE.CylinderGeometry(0.42, 0.52, 2.6, 10);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.35, metalness: 0.25 });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.PI / n; // offset so none block the stair
    const radius = 15.5;
    dummy.position.set(Math.cos(angle) * radius, 1.3, Math.sin(angle) * radius);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.userData = { kind: 'pillars' };
  pillarGroup.add(inst);
  pillarGroup._inst = inst;
}

// ---- STAINED GLASS (languages) — set into the back sanctum wall ----
// Kept (it directly visualizes language diversity — the user wants MORE
// language representation, not less). But the per-glass PointLight is removed
// (was a dynamic light source each); the emissive material alone reads fine.
function buildStainedGlass(langBytes) {
  const sorted = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = Object.values(langBytes).reduce((a, b) => a + b, 1) || 1;
  let x = -5;
  const y = 6.5, z = -6.4;
  sorted.forEach(([lang, bytes]) => {
    const w = Math.max(0.7, (bytes / total) * 9);
    const c = new THREE.Color(langColor(lang));
    const geo = new THREE.PlaneGeometry(w, 4.4);
    const mat = new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.65,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      roughness: 0.2
    });
    const glass = new THREE.Mesh(geo, mat);
    glass.position.set(x + w / 2, y, z);
    glassGroup.add(glass);
    x += w + 0.4;
  });
}

// ---- FALLEN RUINS (GEM #3 — empty state) ----
function buildRuins() {
  const geo = new THREE.BoxGeometry(0.82, 0.42, 0.82);
  for (let i = 0; i < 60; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.6, 0.05, 0.2 + Math.random() * 0.15),
      roughness: 0.9
    });
    const brick = new THREE.Mesh(geo, mat);
    const angle = Math.random() * Math.PI * 2;
    const r = 1 + Math.random() * 7;
    brick.position.set(Math.cos(angle) * r, Math.random() * 0.5, Math.sin(angle) * r);
    brick.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
    brickGroup.add(brick);
  }
  // a few broken pillars
  for (let i = 0; i < 3; i++) {
    const h = 1 + Math.random() * 1.5;
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, h, 10),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.7 })
    );
    const a = Math.random() * Math.PI * 2;
    p.position.set(Math.cos(a) * 6, h / 2 - 0.3, Math.sin(a) * 6);
    p.rotation.z = (Math.random() - 0.5) * 0.3;
    pillarGroup.add(p);
  }
}

// ==================================================================
// STATS + LANG PILLS  (MVP 5)
// ==================================================================
function renderStats(bp) {
  statsEl.classList.add('active');
  $('s-commits').textContent = bp.totalCommits.toLocaleString();
  $('s-stars').textContent = bp.totalStars.toLocaleString();
  $('s-forks').textContent = bp.totalForks.toLocaleString();
  $('s-repos').textContent = bp.repoCount.toLocaleString();
  $('s-langs').textContent = Object.keys(bp.languages).length;
}
function renderLangPills(bp) {
  langPills.innerHTML = '';
  const sorted = Object.entries(bp.languages).sort((a, b) => b[1] - a[1]).slice(0, 8);
  sorted.forEach(([lang]) => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.innerHTML = `<span class="dot" style="background:${langColor(lang)}"></span>${lang}`;
    pill.onclick = () => toggleLangFilter(lang, pill);
    langPills.appendChild(pill);
  });
}
function toggleLangFilter(lang, pill) {
  if (!templeState) return;
  if (templeState.dimmedLangs.has(lang)) {
    templeState.dimmedLangs.delete(lang);
    pill.classList.remove('dimmed');
  } else {
    templeState.dimmedLangs.add(lang);
    pill.classList.add('dimmed');
  }
  applyLangFilter();
}
function applyLangFilter() {
  if (!brickGroup._inst || !templeState) return;
  const inst = brickGroup._inst;
  const pos = brickGroup._positions;
  const colorAttr = inst.instanceColor;
  const c = new THREE.Color();
  for (let i = 0; i < pos.length; i++) {
    const dim = templeState.dimmedLangs.has(pos[i].commit.lang);
    const base = new THREE.Color(langColor(pos[i].commit.lang));
    if (dim) base.multiplyScalar(0.18);
    colorAttr.setXYZ(i, base.r, base.g, base.b);
  }
  colorAttr.needsUpdate = true;
}

// ==================================================================
// INTERACTION — pointer state machine (Phase 8)
//   • single click on a brick  → commit modal (existing behaviour)
//   • hold + move on a brick    → drag the brick across the ground plane
//   • double-click on a brick   → GitHub repo file-tree preview panel
// ==================================================================
const CLICK_DELAY_MS = 220;     // wait this long before resolving a click
let pendingClick = null;        // { id, timer }

function setPointer(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
}

// Raycast the instanced bricks; returns { id, commit } or null.
function pickBrick(e) {
  if (!brickGroup || !brickGroup._inst) return null;
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(brickGroup._inst);
  if (!hit.length) return null;
  const id = hit[0].instanceId;
  const commit = brickGroup._positions[id]?.commit;
  if (!commit) return null;
  return { id, commit, point: hit[0].point };
}

function onPointerDown(e) {
  lastInteraction = Date.now();
  if (e.button !== 0 && e.pointerType === 'mouse') return; // left only on mouse
  const pick = pickBrick(e);
  if (!pick) { drag = null; return; }
  // record a potential drag session
  drag = {
    id: pick.id,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    brickY: brickGroup._positions[pick.id].targetY, // keep this height
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -brickGroup._positions[pick.id].targetY),
    hit: new THREE.Vector3()
  };
}

function onPointerMove(e) {
  lastInteraction = Date.now();
  if (!drag) return;
  // decide whether we've crossed the drag threshold
  if (!drag.moved) {
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    drag.moved = true;
    // entering drag mode: disable orbit so the camera doesn't fight us
    controls.enabled = false;
    // cancel any pending click — this is now a drag, not a click
    if (pendingClick) { clearTimeout(pendingClick.timer); pendingClick = null; }
  }
  // drag the brick: raycast to the horizontal plane at the brick's height
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(drag.plane, drag.hit)) {
    moveBrick(drag.id, drag.hit.x, drag.hit.z, drag.brickY);
  }
}

function onPointerUp(e) {
  lastInteraction = Date.now();
  if (!drag) return;
  const wasDrag = drag.moved;
  const id = drag.id;
  const commit = brickGroup._positions[id]?.commit;
  drag = null;
  controls.enabled = true;
  if (wasDrag) return;            // it was a drag, not a click — don't open modal

  // It's a click. Delay resolving it so a dblclick can cancel it.
  if (pendingClick) { clearTimeout(pendingClick.timer); pendingClick = null; }
  pendingClick = {
    id,
    timer: setTimeout(() => {
      pendingClick = null;
      if (commit) {
        lastBrickRepo = commit.repo;
        showCommitModal(commit);
      }
    }, CLICK_DELAY_MS)
  };
}

function onCanvasDblClick(e) {
  // cancel any pending single-click
  if (pendingClick) { clearTimeout(pendingClick.timer); pendingClick = null; }
  // discard an in-progress drag
  if (drag) { drag = null; controls.enabled = true; }
  const pick = pickBrick(e);
  if (!pick) return;
  lastBrickRepo = pick.commit.repo;
  showRepoTree(pick.commit.repo);
}

// Move a single instanced brick to (x, z), keeping its y and rotation.
function moveBrick(id, x, z, y) {
  const inst = brickGroup._inst;
  const pos = brickGroup._positions[id];
  if (!inst || !pos) return;
  pos.x = x;
  pos.z = z;
  pos.y = y;
  pos.targetY = y;
  const dummy = moveBrick._dummy || (moveBrick._dummy = new THREE.Object3D());
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, pos.rotY || 0, 0);
  dummy.updateMatrix();
  inst.setMatrixAt(id, dummy.matrix);
  inst.instanceMatrix.needsUpdate = true;
}

// ---- commit modal (unchanged behaviour) ----
function showCommitModal(commit) {
  modalMsg.textContent = commit.m || '(no message)';
  modalRepo.textContent = 'repo: ' + commit.repo;
  modalDate.textContent = 'date: ' + (commit.d ? new Date(commit.d).toLocaleString() : 'unknown');
  const u = templeState.blueprint.user.login;
  modalLink.href = commit.sha
    ? `https://github.com/${u}/${commit.repo}/commit/${commit.sha}`
    : `https://github.com/${u}/${commit.repo}`;
  modalEl.classList.add('show');
}
modalClose.onclick = () => modalEl.classList.remove('show');

// ==================================================================
// REPO FILE-TREE PREVIEW  (Phase 8)
// Fetches the repo's git tree (recursive) via the GitHub REST API and
// renders it as an ASCII directory tree — the classic `tree` output.
// ==================================================================
const TREE_CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

async function showRepoTree(repoName) {
  if (!templeState) { showToast('Build a temple first.'); return; }
  const owner = templeState.blueprint.user.login;
  // demo mode has no real GitHub owner
  if (owner === 'demo') {
    treeRepoName.textContent = repoName + ' (demo)';
    treeSub.textContent = 'Demo repos have no real file tree.';
    treeBody.textContent = demoRepoTree(repoName);
    treeLink.href = '#';
    treePanel.classList.add('show');
    return;
  }

  treePanel.classList.add('show');
  treeRepoName.textContent = owner + '/' + repoName;
  treeSub.textContent = 'Loading file tree…';
  treeBody.textContent = '⏳ fetching…';
  treeLink.href = `https://github.com/${owner}/${repoName}`;

  // cache check
  const cacheKey = 'fed-tree:' + owner + '/' + repoName;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts < TREE_CACHE_TTL) {
        renderRepoTree(owner, repoName, cached.tree);
        return;
      }
    }
  } catch (_) {}

  try {
    // 1. get the default branch
    let r = await fetch(`https://api.github.com/repos/${owner}/${repoName}`);
    updateRateLimit(r);
    if (r.status === 404) throw new Error('Repo not found (it may be private).');
    if (r.status === 403) throw new Error('GitHub rate limit hit — try again in ~1 hour.');
    if (!r.ok) throw new Error('Could not fetch repo (' + r.status + ').');
    const repoInfo = await r.json();
    const branch = repoInfo.default_branch || 'main';

    // 2. get the full recursive tree
    r = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`);
    updateRateLimit(r);
    if (!r.ok) throw new Error('Could not fetch tree (' + r.status + ').');
    const treeData = await r.json();

    const truncated = !!treeData.truncated;
    const entries = (treeData.tree || []).filter(e => e.type === 'blob' || e.type === 'tree');

    const tree = { entries, branch, truncated };
    try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), tree })); } catch (_) {}

    renderRepoTree(owner, repoName, tree);
  } catch (e) {
    treeSub.textContent = 'Error';
    treeBody.textContent = '✗ ' + (e.message || 'Failed to load tree.');
  }
}

// Render the cached/fetched tree as ASCII into the panel (textContent = safe).
function renderRepoTree(owner, repoName, tree) {
  const entries = tree.entries || [];
  if (!entries.length) {
    treeSub.textContent = 'tree: ' + (tree.branch || '?') + ' — empty';
    treeBody.textContent = '(no files)';
    return;
  }
  // Build a nested node map from flat path list.
  const root = { name: repoName, type: 'tree', children: {} };
  let blobCount = 0, totalBytes = 0;
  for (const e of entries) {
    const parts = e.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = { name: part, type: isLast ? e.type : 'tree', children: {}, size: isLast ? (e.size || 0) : 0 };
      }
      node = node.children[part];
      if (isLast && e.type === 'blob') { blobCount++; totalBytes += (e.size || 0); }
    }
  }

  const lines = [];
  lines.push(root.name + '/');
  walkTree(root, '', lines);
  if (tree.truncated) {
    lines.push('');
    lines.push('⚠ tree truncated by GitHub (too many entries).');
  }

  treeSub.textContent = `${blobCount} files · ${formatBytes(totalBytes)} · branch: ${tree.branch}`;
  treeBody.textContent = lines.join('\n');
  treeLink.href = `https://github.com/${owner}/${repoName}`;
}

// Depth-first ASCII tree walk — classic `tree` style with ├── └── │.
function walkTree(node, prefix, lines) {
  const children = Object.values(node.children);
  // directories first, then files, each alpha-sorted
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    if (child.type === 'tree') {
      lines.push(prefix + branch + child.name + '/');
      walkTree(child, prefix + (isLast ? '    ' : '│   '), lines);
    } else {
      lines.push(prefix + branch + child.name);
    }
  }
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

// Fake but plausible tree for demo mode (no API calls).
function demoRepoTree(repoName) {
  return [
    repoName + '/',
    '├── src/',
    '│   ├── index.js',
    '│   ├── forge.js',
    '│   └── utils.js',
    '├── tests/',
    '│   └── forge.test.js',
    '├── README.md',
    '├── package.json',
    '└── LICENSE',
    '',
    '(demo — not a real GitHub repo)'
  ].join('\n');
}

treeClose.onclick = () => treePanel.classList.remove('show');

// ==================================================================
// AUTO-ORBIT
// ==================================================================
function enableInitialOrbit() {
  autoOrbitOn = true;
  setTimeout(() => { if (Date.now() - lastInteraction > INITIAL_ORBIT_MS - 500) autoOrbitOn = false; }, INITIAL_ORBIT_MS);
}

// ==================================================================
// RENDER LOOP  (Phase 9: stripped — camera orbit + controls + render only)
// Removed per-frame work: ghost loop, lantern flicker, aura spin, relic float.
// ==================================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // idle auto-orbit (paused while dragging a brick)
  if (!drag && !autoOrbitOn && Date.now() - lastInteraction > IDLE_ORBIT_MS) autoOrbitOn = true;
  if (autoOrbitOn && !drag) {
    const radius = 38;
    const a = Math.atan2(camera.position.x, camera.position.z) + dt * 0.12;
    camera.position.x = Math.sin(a) * radius;
    camera.position.z = Math.cos(a) * radius;
    camera.position.y = 20;
    camera.lookAt(controls.target);
  }

  controls.update();
  renderer.render(scene, camera);
}

// ==================================================================
// SHAREABLE LINK  (MVP 7)
// ==================================================================
function encodeShare(bp) {
  // slim the blueprint to reduce hash size
  const slim = {
    u: bp.user.login, n: bp.user.name, rc: bp.repoCount,
    tc: bp.totalCommits, ts: bp.totalStars, tf: bp.totalForks,
    L: bp.languages,
    C: bp.commits.map(c => [c.m, c.d, c.lang, c.repo, c.sha]),
    G: bp.contributors
  };
  const json = JSON.stringify(slim);
  return LZString.compressToEncodedURIComponent(json);
}
function decodeShare() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash);
    const s = JSON.parse(json);
    return {
      user: { login: s.u, name: s.n, avatar: '' },
      repoCount: s.rc, totalCommits: s.tc, totalStars: s.ts, totalForks: s.tf,
      totalIssues: 0, totalPRs: 0, languages: s.L,
      commits: s.C.map(a => ({ m: a[0], d: a[1], lang: a[2], repo: a[3], sha: a[4] })),
      contributors: s.G || []
    };
  } catch (e) { return null; }
}

// ==================================================================
// DOWNLOAD STANDALONE HTML  (MVP 8)
// ==================================================================
function downloadStandaloneHTML(bp) {
  const slim = encodeShare(bp);
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FED-TEMPLE — ${bp.user.login}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/FED-OS/FED-TEMPLE@main/styles.css"/>
<script src="https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"></script>
</head><body>
<div id="ui"><h1><span class="logo">🛕</span> FED-TEMPLE — ${bp.user.login}</h1>
<div id="stats" class="active"><h2>// Snapshot</h2>
<div class="stat-row"><span>commits</span><span class="v">${bp.totalCommits}</span></div>
<div class="stat-row"><span>stars</span><span class="v">${bp.totalStars}</span></div>
<div class="stat-row"><span>forks</span><span class="v">${bp.totalForks}</span></div></div></div>
<div id="modal"><div class="m-head"><div class="m-tag">// commit</div></div>
<div class="m-msg" id="modalMsg"></div><div class="m-meta" id="modalRepo"></div></div>
<div id="canvas-container"></div>
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const HASH="${slim}";
// minimal inline renderer for snapshot
${SNAPTIME_INLINE}
</script></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fed-temple-${bp.user.login}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Standalone HTML downloaded.', 'ok');
}

// ==================================================================
// SNAPSHOT PNG  (GEM #5)
// ==================================================================
function snapshotPNG() {
  const prevDisplay = ui.style.display;
  ui.style.display = 'none';
  const tb = $('toolbar'); const tbPrev = tb.style.display; tb.style.display = 'none';
  const tp = treePanel; const tpPrev = tp.style.display; tp.style.display = 'none';
  const hd = hintEl; const hdPrev = hd.style.display; hd.style.display = 'none';
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `fed-temple-${templeState?.blueprint.user.login || 'snapshot'}.png`;
  a.click();
  ui.style.display = prevDisplay; tb.style.display = tbPrev;
  tp.style.display = tpPrev; hd.style.display = hdPrev;
  showToast('Snapshot saved as PNG.', 'ok');
}

// ==================================================================
// ORCHESTRATION
// ==================================================================
async function runBuild(demo = false) {
  const username = (usernameInput.value || '').trim() || 'FED-OS';
  if (!demo) usernameInput.value = username;
  setButtons(true);
  progressWrap.classList.add('active');
  progressFill.style.width = '0%';

  abortCtrl = new AbortController();
  try {
    let bp;
    if (demo) {
      setProgress('Summoning demo temple…', 20);
      await new Promise(r => setTimeout(r, 300));
      bp = demoBlueprint();
    } else {
      bp = await fetchAllData(username, setProgress, abortCtrl.signal);
    }
    setProgress('Raising the temple…', 100);
    buildTemple(bp);
    setTimeout(() => progressWrap.classList.remove('active'), 1200);
    showToast(`Temple raised: ${bp.totalCommits} bricks, ${bp.totalStars} stars.`, 'ok');
    showHint();
  } catch (e) {
    if (e.name === 'AbortError') {
      showToast('Build cancelled.');
    } else {
      showToast(e.message || 'Build failed.');
    }
    progressWrap.classList.remove('active');
  } finally {
    setButtons(false);
    abortCtrl = null;
  }
}

// ==================================================================
// WIRE UP UI
// ==================================================================
buildBtn.onclick = () => runBuild(false);
demoBtn.onclick = () => runBuild(true);
cancelBtn.onclick = () => { if (abortCtrl) abortCtrl.abort(); };
toggleUi.onclick = () => {
  ui.classList.toggle('collapsed');
  toggleUi.textContent = ui.classList.contains('collapsed') ? '👁 Show' : '👁 Hide';
};
// stats panel collapse/expand via header click
$('statsToggle').onclick = () => {
  const collapsed = statsEl.classList.toggle('collapsed');
  $('statsToggle').textContent = collapsed ? '// Blueprint ▸' : '// Blueprint ▾';
};
$('resetCam').onclick = () => {
  camera.position.set(26, 18, 34);
  controls.target.set(0, 2, 0);
  controls.update();
  autoOrbitOn = false; lastInteraction = Date.now();
};
$('autoRotate').onclick = (e) => {
  autoOrbitOn = !autoOrbitOn;
  lastInteraction = autoOrbitOn ? 0 : Date.now();
  e.target.textContent = autoOrbitOn ? '⏸ Stop' : '🔄 Orbit';
};
$('snapshot').onclick = snapshotPNG;
$('downloadHtml').onclick = () => {
  if (templeState) downloadStandaloneHTML(templeState.blueprint);
  else showToast('Build a temple first.');
};
$('shareLink').onclick = async () => {
  if (!templeState) { showToast('Build a temple first.'); return; }
  const hash = encodeShare(templeState.blueprint);
  const url = `${location.origin}${location.pathname}#${hash}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Shareable link copied to clipboard.', 'ok');
  } catch {
    location.hash = hash;
    showToast('Link set in URL bar — copy it manually.', 'ok');
  }
};
// Tree button: re-open the tree for the last touched brick's repo
toggleTreeBtn.onclick = () => {
  if (!lastBrickRepo) { showToast('Click or double-click a brick first.'); return; }
  showRepoTree(lastBrickRepo);
};

// keyboard shortcuts
addEventListener('keydown', (e) => {
  if (e.target === usernameInput) return;
  if (e.key === 'r' || e.key === 'R') $('resetCam').click();
  if (e.key === 's' || e.key === 'S') $('snapshot').click();
  if (e.key === 'h' || e.key === 'H') toggleUi.click();
});

// ==================================================================
// BOOT
// ==================================================================
async function boot() {
  startAscii();
  asciiStatus.textContent = 'Initializing WebGL forge...';
  // let the ASCII breathe a moment
  await new Promise(r => setTimeout(r, 600));
  try {
    initScene();
    asciiStatus.textContent = 'Forge ready.';
  } catch (e) {
    asciiStatus.textContent = 'WebGL unavailable — try another browser.';
    return;
  }
  await new Promise(r => setTimeout(r, 500));
  stopAscii();

  // if a shared hash is present, render immediately
  const shared = decodeShare();
  if (shared) {
    buildTemple(shared);
    showToast('Loaded shared temple from link.', 'ok');
    showHint();
  } else {
    // auto-run demo so first-time visitors see magic instantly (MVP 9 default demo)
    runBuild(true);
  }
}

boot();

// ==================================================================
// STANDALONE SNAPSHOT TEMPLATE (used by downloadStandaloneHTML)
// Phase 9: same perf wins — no shadows, dpr 1, no antialias, interleaved layout.
// ==================================================================
const SNAPTIME_INLINE = `
const s=JSON.parse(LZString.decompressFromEncodedURIComponent(HASH));
const bp={user:{login:s.u,name:s.n,avatar:''},repoCount:s.rc,totalCommits:s.tc,
totalStars:s.ts,totalForks:s.tf,languages:s.L,
commits:s.C.map(a=>({m:a[0],d:a[1],lang:a[2],repo:a[3],sha:a[4]})),contributors:s.G||[]};
const LC={'JavaScript':'#f1e05a','TypeScript':'#3178c6','Python':'#4B8BBE','HTML':'#e34c26','CSS':'#8B5CF6','Shell':'#89e051','Rust':'#dea584','Go':'#00ADD8','Java':'#b07219','C':'#8B8B8B','C++':'#f34b7d','C#':'#178600','Ruby':'#701516','PHP':'#7B8AB8','Vue':'#41b883','Unknown':'#888888'};
const lc=l=>LC[l]||'#888888';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0d1117);
const cam=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,0.1,500);
cam.position.set(26,18,34);
const ren=new THREE.WebGLRenderer({antialias:false});ren.setPixelRatio(1);ren.setSize(innerWidth,innerHeight);
document.getElementById('canvas-container').appendChild(ren.domElement);
const ctrl=new OrbitControls(cam,ren.domElement);ctrl.target.set(0,2,0);ctrl.enableDamping=true;ctrl.maxPolarAngle=Math.PI*0.495;ctrl.maxDistance=120;
scene.add(new THREE.AmbientLight(0x556070,0.85));
const sun=new THREE.DirectionalLight(0xfff4e0,1.25);sun.position.set(20,34,16);scene.add(sun);
const g=new THREE.Mesh(new THREE.CircleGeometry(70,48),new THREE.MeshStandardMaterial({color:0x141821,roughness:0.92}));g.rotation.x=-Math.PI/2;scene.add(g);
const commits=bp.commits;
const bw=0.82,bh=0.42,gap=0.05,sx=bw+gap,sz=bw+gap;
const byR={};commits.forEach(c=>{const r=c.repo||'unknown';if(!byR[r])byR[r]={name:r,commits:[]};byR[r].commits.push(c);});
const groups=Object.values(byR).sort((a,b)=>b.commits.length-a.commits.length);
const sp=groups.length<=1?0:groups.length<=4?16:groups.length<=8?14:12;
const pp=[{x:0,z:0}];for(let i=0;i<groups.length-1;i++){const a=(i/(groups.length-1))*Math.PI*2;pp.push({x:Math.cos(a)*sp,z:Math.sin(a)*sp});}
function mp(bc,tiers,cc){const sl=[];let course=0,cols=bc,rows=bc;const ins=2;
for(let t=0;t<tiers;t++){const ox=-(cols-1)/2*sx,oz=-(rows-1)/2*sz;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)sl.push({x:ox+c*sx,z:oz+r*sz,course});course++;cols=Math.max(3,cols-ins*2);rows=Math.max(3,rows-ins*2);}
if(cols>=3&&rows>=3){const ox=-(cols-1)/2*sx,oz=-(rows-1)/2*sz;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)sl.push({x:ox+c*sx,z:oz+r*sz,course});course++;}
return sl;}
const allS=[];for(let gi=0;gi<groups.length;gi++){const grp=groups[gi];if(!grp.commits.length)continue;const pos=pp[gi];
const bc=Math.min(14,Math.max(4,Math.round(Math.sqrt(grp.commits.length)*0.9)));const ti=grp.commits.length>400?3:grp.commits.length>80?2:1;
const pl=mp(bc,ti,grp.commits.length);const uc=Math.min(pl.length,grp.commits.length);
for(let i=0;i<uc;i++){const sl=pl[i];const c=grp.commits[i];const st=(sl.course%2===1)?sx/2:0;const x=pos.x+sl.x+st,z=pos.z+sl.z,y=bh/2+sl.course*(bh+gap);allS.push({x,z,y,rotY:sl.rotY||0,c});}}
const useCount=allS.length;
const geo=new THREE.BoxGeometry(bw,bh,bw);
const mat=new THREE.MeshStandardMaterial({roughness:0.78,metalness:0.06});
const inst=new THREE.InstancedMesh(geo,mat,useCount);scene.add(inst);
const ca=new THREE.InstancedBufferAttribute(new Float32Array(useCount*3),3);inst.instanceColor=ca;
const d=new THREE.Object3D();const col=new THREE.Color();
for(let i=0;i<useCount;i++){const s2=allS[i];d.position.set(s2.x,s2.y,s2.z);d.rotation.set(0,s2.rotY,0);d.updateMatrix();inst.setMatrixAt(i,d.matrix);col.set(lc(s2.c.lang));ca.setXYZ(i,col.r,col.g,col.b);}
inst.instanceMatrix.needsUpdate=true;ca.needsUpdate=true;
addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();ren.setSize(innerWidth,innerHeight);});
let autoOn=true,lastInt=Date.now();ren.domElement.addEventListener('pointerdown',()=>{autoOn=false;lastInt=Date.now();});
function a(){requestAnimationFrame(a);if(!autoOn&&Date.now()-lastInt>8000)autoOn=true;
if(autoOn){const r=38,ang=Math.atan2(cam.position.x,cam.position.z)+0.005;cam.position.x=Math.sin(ang)*r;cam.position.z=Math.cos(ang)*r;cam.position.y=20;cam.lookAt(ctrl.target);}
ctrl.update();ren.render(scene,cam);}a();
`;
