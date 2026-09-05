/* ===================================================================
   FED-TEMPLE — temple.js
   The Digital Monument — core engine
   -------------------------------------------------------------------
   Phase 10: Labels + Two build modes.
     • CSS2D labels over every temple — you can READ what each build is
       (repo name · commit count · language dot) without clicking.
       Click a label → repo file-tree panel. Click the big label in
       "one temple" mode → explode into per-repo temples.
     • Mode ONE  — a single grand ziggurat forged from EVERY repo the
       user has (commits interleaved round-robin so colors mix through
       the whole monument), monumental front staircase, one user label.
     • Mode MANY — the temple separates into smaller temples, one per
       repo, arranged in concentric rings, each with its own label.
     • Switch instantly (buttons, or M key) — rebuilds from the cached
       blueprint, no refetch, no API cost.
     • Data mining now covers EVERY non-fork repo (breadth-first page
       per repo, depth pages for the top-starred flagships).

   Phase 9 (kept): Performance, color diversity, declutter, UI reduction.
     • Shadows OFF, pixel ratio capped at 1, antialias OFF
     • Single sun light + ambient (no dynamic PointLights)
     • Golden tiles + pillars INSTANCED (one draw call each)
     • Commits INTERLEAVED by repo round-robin so colors spread throughout
     • animate() loop stripped to camera + controls + render (+labels)
   =================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// lz-string is loaded as a classic <script> in index.html and exposes the
// global `LZString`. (The CDN build has no ESM default export, so importing it
// as a module throws and kills the app before boot.) Keep using the global.
const LZString = window.LZString;

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const MAX_BRICKS = 5000;       // hard cap so the browser doesn't die
const MINED_REPOS_CAP = 30;    // mine commits from EVERY repo, up to this many (API budget)
const DEPTH_REPOS = 3;         // flagship repos that get extra depth pages
const DEPTH_PAGES = 3;         // extra commit pages for flagship repos
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h localStorage cache
const CACHE_VERSION = 'v2';    // bump to invalidate old caches (new per-repo mining)
const IDLE_ORBIT_MS = 30000;   // resume auto-orbit after this idle
const INITIAL_ORBIT_MS = 10000; // auto-orbit on first build

// label visibility: fully opaque closer than START, gone beyond END
const LABEL_FADE_START = 100;
const LABEL_FADE_END = 145;

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
      toggleTreeBtn = $('toggleTree'), hintEl = $('hint'),
      modeOneBtn = $('modeOne'), modeManyBtn = $('modeMany');

// rate-info was removed in the Phase 8 UI slim; keep a nullable ref so
// updateRateLimit() can no-op gracefully without a ReferenceError.
const rateInfo = $('rate-info');   // null in current UI

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
let abortCtrl = null;
let scene, camera, renderer, controls, raycaster, pointer, clock;
let labelRenderer;                       // CSS2D overlay for temple labels
let brickGroup, tileGroup, pillarGroup, glassGroup, ghostGroup, stairGroup;
let templeState = null;        // { blueprint, dimmedLangs:Set, mode }
let lastInteraction = Date.now();
let autoOrbitOn = false;

// ---- build mode (Phase 10) ----
// 'one'  = a single grand temple forged from every repo
// 'many' = separate smaller temples, one per repo
let templeMode = 'one';

// ---- temple labels (Phase 10) ----
let labels = [];               // [{ obj: CSS2DObject, el: HTMLElement }]

// auto-orbit framing, set per build/mode
let orbitR = 44, orbitY = 21;

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

// Hint badge: show the interaction tips briefly after each build.
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
// DATA HARVESTER  (MVP 1,2,3 + Phase 10: mine EVERY repo)
//   • breadth-first: one commits page (100) per repo, across every
//     non-fork repo the user has (up to MINED_REPOS_CAP, API budget)
//   • then depth: a few extra pages for the top-starred flagships
//   • commits are kept grouped per repo (repoGroups) so BOTH build
//     modes can be forged from one blueprint
//   • interleaved round-robin ordering for the unified temple
// ==================================================================
async function fetchAllData(username, onProgress, signal) {
  const cacheKey = `fed-temple:${CACHE_VERSION}:` + username.toLowerCase();
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

  // ---- candidate repos: EVERY repo the user has (forks last resort) ----
  // Forks are copies of other people's projects — they aren't really "the
  // user's builds", so we prefer originals. If the user owns nothing but
  // forks, we fall back to those so the temple is never empty.
  let candidates = repos.filter(repo => !repo.fork);
  if (candidates.length === 0) candidates = repos.slice();
  // most recently pushed first (repos already come sorted by pushed)
  const minedRepos = candidates.slice(0, MINED_REPOS_CAP);
  if (candidates.length > MINED_REPOS_CAP) {
    onProgress(`${candidates.length} repos — mining the ${MINED_REPOS_CAP} most recent.`, 9);
  }

  // ---- breadth: one commits page per repo, across EVERY mined repo ----
  // perRepo[i] = chronological commits of mined repo i
  const perRepo = [];
  const totalCollected = () => perRepo.reduce((a, b) => a + b.length, 0);

  async function mineRepo(repo, maxPages, label) {
    const bucket = [];
    let p = 1, got = 0;
    while (got < 500 && (totalCollected() + bucket.length) < MAX_BRICKS && p <= maxPages) {
      try {
        const cr = await fetch(
          api(`/repos/${username}/${repo.name}/commits?per_page=100&page=${p}`),
          { signal });
        if (!cr.ok) break;              // empty repo (409) / private / etc — skip
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
    // sort each repo's commits chronologically (oldest first)
    bucket.sort((a, b) => new Date(a.d) - new Date(b.d));
    perRepo.push(bucket);
    if (label) onProgress(label, 10 + (perRepo.length / minedRepos.length) * 70);
  }

  for (let i = 0; i < minedRepos.length; i++) {
    if (totalCollected() >= MAX_BRICKS) break;
    const repo = minedRepos[i];
    await mineRepo(repo, 1,
      `Mining every repo: ${repo.name} (${i + 1}/${minedRepos.length})`);
  }

  // ---- depth: extra pages for the top-starred flagships ----
  // Breadth guarantees every repo is represented; depth fattens the
  // monuments of the user's flagship projects (biggest pyramids).
  const flagships = [...minedRepos]
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, DEPTH_REPOS);
  for (let i = 0; i < flagships.length; i++) {
    if (totalCollected() >= MAX_BRICKS) break;
    const repo = flagships[i];
    // find its bucket and append older pages
    const bucketIdx = perRepo.length; // appended below via temp
    onProgress(`Deep-mining flagship: ${repo.name}`, 82 + (i / flagships.length) * 8);
    const before = totalCollected();
    // mine depth pages into a scratch bucket then merge
    const scratch = [];
    const saved = perRepo;
    // reuse mineRepo by temporarily pointing it at our scratch
    // (simplest: inline depth mining)
    let p = 2, got = 0;
    const target = perRepo.find(b => b.length && b[0].repo === repo.name);
    while (got < 500 && totalCollected() < MAX_BRICKS && p <= DEPTH_PAGES + 1) {
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
          if (target) target.push({
            m: (c.commit.message || '').split('\n')[0].slice(0, 160),
            d: c.commit.author ? c.commit.author.date : '',
            lang: repo.language || 'Unknown',
            repo: repo.name,
            sha: c.sha || ''
          });
          else scratch.push({
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
        break;
      }
    }
    if (scratch.length) {
      scratch.sort((a, b) => new Date(a.d) - new Date(b.d));
      perRepo.push(scratch);
    }
    if (target) target.sort((a, b) => new Date(a.d) - new Date(b.d));
  }

  // ---- INTERLEAVE commits round-robin across repos ----
  // One commit from each repo in turn: every layer of the unified temple
  // contains a mix of repos/languages, so the monument reads as a rich,
  // multi-colored ziggurat instead of solid color bands.
  const allCommits = [];
  const collected = totalCollected();
  const targetCount = Math.min(collected, MAX_BRICKS);
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

  // ---- per-repo groups (for "all temples" mode + labels) ----
  // Every repo that yielded commits gets its own group with a dominant
  // language (for the label's color dot).
  const repoGroups = [];
  for (let i = 0; i < perRepo.length; i++) {
    if (perRepo[i].length === 0) continue;
    const commits = perRepo[i];
    const langCounts = {};
    commits.forEach(c => { langCounts[c.lang] = (langCounts[c.lang] || 0) + 1; });
    const dominant = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0][0];
    repoGroups.push({ name: commits[0].repo, commits, lang: dominant });
  }
  // Sort by commit count desc so the biggest temple sits at center
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
// DEMO DATA  (MVP 9 — Phase 10: 7 repos, each pure-language)
// Each demo repo uses its own language, matching how real mined data
// behaves (a repo's commits carry the repo's language). The unified
// temple still mixes colors via round-robin interleave.
// ==================================================================
function demoBlueprint() {
  const demoRepos = [
    { name: 'monolith', count: 180, lang: 'JavaScript' },
    { name: 'oracle',   count: 90,  lang: 'Python' },
    { name: 'sigil',    count: 55,  lang: 'TypeScript' },
    { name: 'forge',    count: 40,  lang: 'Rust' },
    { name: 'ashes',    count: 25,  lang: 'HTML' },
    { name: 'prism',    count: 18,  lang: 'CSS' },
    { name: 'ember',    count: 12,  lang: 'Shell' }
  ];
  const commits = [];
  const now = Date.now();
  const repoGroups = demoRepos.map((repo, ri) => {
    const repoCommits = [];
    for (let i = 0; i < repo.count; i++) {
      const c = {
        m: ['feat: add module','fix: edge case','docs: readme','refactor: cleanup','chore: deps','init: scaffold','perf: optimize','style: format'][i % 8],
        d: new Date(now - (repo.count - i) * 86400000 * 3).toISOString(),
        lang: repo.lang,
        repo: repo.name,
        sha: (i * 9999 + ri * 7777).toString(16).padStart(7, '0')
      };
      repoCommits.push(c);
      commits.push(c);
    }
    return { name: repo.name, commits: repoCommits, lang: repo.lang };
  });
  repoGroups.sort((a, b) => b.commits.length - a.commits.length);
  return {
    user: { login: 'demo', name: 'Demo Builder', avatar: '' },
    repoCount: demoRepos.length,
    totalCommits: commits.length,
    commits,
    repoGroups,
    totalStars: 42, totalForks: 9, totalIssues: 3, totalPRs: 17,
    languages: { JavaScript:180, TypeScript:55, Python:90, Rust:40, HTML:25, CSS:18, Shell:12 },
    contributors: [
      { name:'demo', count:300 },{ name:'ghost1', count:80 },
      { name:'phantom', count:40 }
    ]
  };
}

// ==================================================================
// SCENE SETUP  (Phase 9: stripped for performance + Phase 10 labels)
//   • No shadows (biggest GPU win — removes 2048² shadow pass entirely)
//   • Pixel ratio capped at 1 (retina 2× = 4× the fragment work)
//   • Antialias OFF
//   • One DirectionalLight + AmbientLight only (no dynamic PointLights)
//   • CSS2DRenderer overlay for always-visible temple labels
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

  // ---- label layer (Phase 10) ----
  // CSS2DRenderer draws DOM labels projected onto 3D anchor points. The
  // layer itself ignores pointer events; each label re-enables them so
  // clicks pass through empty space but hit labels.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelRenderer.domElement.style.zIndex = '5';
  container.appendChild(labelRenderer.domElement);

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
  stairGroup = new THREE.Group(); scene.add(stairGroup);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();

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
  labelRenderer.setSize(innerWidth, innerHeight);
}

// ==================================================================
// TEMPLE FORGE  (Phase 10: two build modes, one forge)
//   buildTemple(bp, mode)
//     mode 'one'  → ONE grand ziggurat from every repo (interleaved)
//     mode 'many' → separate smaller temples, one per repo (rings)
// ==================================================================
function clearTemple() {
  [brickGroup, tileGroup, pillarGroup, glassGroup, ghostGroup, stairGroup].forEach(g => {
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose?.();
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material?.dispose?.();
    }
  });
  clearLabels();
}

function buildTemple(bp, mode = templeMode) {
  clearTemple();
  templeMode = mode;
  templeState = { blueprint: bp, dimmedLangs: new Set(), mode };
  renderStats(bp);
  renderLangPills(bp);
  updateModeButtons();

  const hasCommits = bp.commits && bp.commits.length > 0;

  if (!hasCommits) {
    buildRuins();                      // GEM: empty-state ruins
    showToast('No commits found — summoning the fallen ruins.', 'ok', 5000);
    return;
  }

  if (mode === 'one') {
    buildOneTemple(bp);                // grand unified ziggurat
  } else {
    buildManyTemples(bp);              // per-repo temple ring
  }
  applyLangFilter();                   // keep any active language dimming
  enableInitialOrbit();
}

// ---- MODE ONE: the grand ziggurat ----
// Every repo's commits interleaved into a single stepped monument with a
// monumental front staircase. One label crowns the apex: the user.
function buildOneTemple(bp) {
  const bw = 0.82, bh = 0.42, bd = 0.82, gap = 0.05;
  const sx = bw + gap, sz = bd + gap;

  const commits = bp.commits;
  const plan = planGrandPyramid(commits.length, sx, sz);

  // slots → world positions (stagger odd courses for brick texture)
  const allSlots = [];
  let topY = 0;
  for (let i = 0; i < Math.min(plan.slots.length, commits.length); i++) {
    const slot = plan.slots[i];
    const c = commits[i];
    const stagger = (slot.course % 2 === 1) ? sx / 2 : 0;
    const x = slot.x + stagger;
    const z = slot.z;
    const y = bh / 2 + slot.course * (bh + gap);
    if (y > topY) topY = y;
    allSlots.push({ x, z, y, rotY: 0, commit: c });
  }

  forgeBricks(allSlots, bw, bh, bd);
  buildStair(plan, sx, sz, bh, gap);
  buildGoldenTiles(bp.totalStars, Math.max(21, plan.halfWidth + 4));
  buildPillars(bp.totalForks, Math.max(20, plan.halfWidth + 3));
  buildStainedGlass(bp.languages, { z: -(plan.halfWidth + 1.6), y: topY + 1.1 });

  // the user's label crowns the apex — click it to explode into per-repo temples
  const login = bp.user.login;
  addUserLabel(login,
    `${bp.repoCount} repos · ${bp.totalCommits.toLocaleString()} commits`,
    topY + 2.0);

  // framing: quarter view from the stair side (+Z)
  const extent = plan.halfWidth + 4;
  orbitR = Math.max(34, extent * 2.2);
  orbitY = orbitR * 0.48;
  camera.position.set(orbitR * 0.45, orbitY, orbitR * 0.91);
  controls.target.set(0, Math.max(2, topY * 0.5), 0);
  controls.update();
  brickGroup._pyramids = [{ name: login, cx: 0, cz: 0, topY }];
}

// ---- MODE MANY: one temple per repo ----
// Each repo becomes its own visible step-pyramid with a label. Temples
// are arranged in concentric rings (biggest at center) sized by commits.
function buildManyTemples(bp) {
  const bw = 0.82, bh = 0.42, bd = 0.82, gap = 0.05;
  const sx = bw + gap, sz = bd + gap;

  // groups: prefer the blueprint's repoGroups; fall back to grouping
  // by commit.repo (e.g. temples loaded from old share links).
  let groups = bp.repoGroups;
  if (!groups || groups.length === 0) {
    const byRepo = {};
    bp.commits.forEach(c => {
      const r = c.repo || 'unknown';
      if (!byRepo[r]) byRepo[r] = { name: r, commits: [] };
      byRepo[r].commits.push(c);
    });
    groups = Object.values(byRepo).sort((a, b) => b.commits.length - a.commits.length);
  }

  const layout = layoutRings(groups.length);
  const allSlots = [];
  const labelEntries = [];   // per-temple label data
  let extent = 8;

  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    if (!grp.commits.length) continue;
    const pos = layout[gi];

    const cc = grp.commits.length;
    const baseCols = Math.min(13, Math.max(5, Math.round(Math.sqrt(cc * 0.5))));
    const plan = planMiniPyramid(baseCols, cc, sx, sz);
    const useCount = Math.min(plan.length, cc);

    let topY = 0;
    for (let i = 0; i < useCount; i++) {
      const slot = plan[i];
      const c = grp.commits[i];
      const stagger = (slot.course % 2 === 1) ? sx / 2 : 0;
      const x = pos.x + slot.x + stagger;
      const z = pos.z + slot.z;
      const y = bh / 2 + slot.course * (bh + gap);
      if (y > topY) topY = y;
      allSlots.push({ x, z, y, rotY: slot.rotY || 0, commit: c });
    }
    const ringR = Math.max(Math.abs(pos.x), Math.abs(pos.z));
    const halfW = (baseCols * sx) / 2;
    extent = Math.max(extent, ringR + halfW);
    labelEntries.push({
      name: grp.name, x: pos.x, z: pos.z, topY,
      lang: grp.lang || grp.commits[0].lang, count: cc
    });
  }

  forgeBricks(allSlots, bw, bh, bd);
  buildGoldenTiles(bp.totalStars, Math.max(17, extent + 2));
  buildPillars(bp.totalForks, Math.min(48, extent + 3));
  buildStainedGlass(bp.languages, { z: -6.4, y: 6.5 });

  // per-repo labels — click one to open its file tree
  addRepoLabels(labelEntries);

  // framing: pulled back to see the whole ring of temples
  orbitR = Math.min(75, Math.max(36, extent * 1.4 + 10));
  orbitY = orbitR * 0.42;
  camera.position.set(orbitR * 0.5, orbitY, orbitR * 0.87);
  controls.target.set(0, 2, 0);
  controls.update();
  brickGroup._pyramids = labelEntries.map(e => ({ name: e.name, cx: e.x, cz: e.z, topY: e.topY }));
}

// ---- shared brick forging (one InstancedMesh for any mode) ----
function forgeBricks(allSlots, bw, bh, bd) {
  const useCount = allSlots.length;
  if (useCount === 0) return;

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

  animateBrickRise(positions, inst);
}

// ---- grand ziggurat plan (mode ONE) ----
// Stack full square courses, each inset 2 bricks per side, until we have
// enough slots for every commit. Finds the smallest odd base that fits.
// Returns { slots, base, courses, halfWidth, courseRows }.
function planGrandPyramid(commitCount, sx, sz) {
  const capacity = (b) => {
    let t = 0, c = b;
    while (c >= 3) { t += c * c; c -= 4; }
    return t;
  };
  let base = 5;
  while (capacity(base) < commitCount && base < 45) base += 2;

  const slots = [];
  const courseRows = [];
  let course = 0, cols = base, rows = base;
  while (cols >= 3 && rows >= 3) {
    const ox = -(cols - 1) / 2 * sx;
    const oz = -(rows - 1) / 2 * sz;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({ x: ox + c * sx, z: oz + r * sz, course });
      }
    }
    courseRows.push(rows);
    if (slots.length >= commitCount) break;
    course++;
    cols -= 4;
    rows -= 4;
  }
  return {
    slots, base, courseRows,
    courses: courseRows.length,
    halfWidth: (base * sx) / 2
  };
}

// ---- monumental front staircase (mode ONE) ----
// A straight run of stone steps climbing the +Z face, one step per course,
// hugging the stepped profile. Reads instantly as "temple entrance".
function buildStair(plan, sx, sz, bh, gap) {
  const steps = plan.courseRows.length;
  if (steps === 0) return;
  const geo = new THREE.BoxGeometry(4.4, bh, sz * 1.35);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.35, metalness: 0.25 });
  const inst = new THREE.InstancedMesh(geo, mat, steps);
  const dummy = new THREE.Object3D();
  for (let c = 0; c < steps; c++) {
    const rows = plan.courseRows[c];
    const frontZ = (rows - 1) / 2 * sz;          // course's front edge
    const y = bh / 2 + c * (bh + gap);
    dummy.position.set(0, y, frontZ + sz * 0.85);
    dummy.updateMatrix();
    inst.setMatrixAt(c, dummy.matrix);
  }
  stairGroup.add(inst);
}

// ---- concentric ring layout (mode MANY) ----
// Index 0 (biggest repo) at center. Remaining temples fill rings at
// radius 15 / 27 / 39 (capacity from circumference ÷ 12.5 spacing), each
// ring's slots staggered so they don't align with the ring inside.
// Overflow beyond 42 temples continues as a golden-angle spiral.
function layoutRings(n) {
  const out = [{ x: 0, z: 0 }];
  if (n <= 1) return out;
  const rings = [15, 27, 39];
  let placed = 1, ringIdx = 0;
  while (placed < n && ringIdx < rings.length) {
    const R = rings[ringIdx];
    const cap = Math.max(1, Math.floor((2 * Math.PI * R) / 12.5));
    const count = Math.min(cap, n - placed);
    const offset = ringIdx * 0.55;   // stagger slots between rings
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      out.push({ x: Math.cos(a) * R, z: Math.sin(a) * R });
    }
    placed += count;
    ringIdx++;
  }
  let j = 0;
  while (placed < n) {               // spiral overflow (rare: >42 repos)
    const R = 39 + Math.sqrt(++j) * 4.5;
    const a = j * 2.39996;           // golden angle
    out.push({ x: Math.cos(a) * R, z: Math.sin(a) * R });
    placed++;
  }
  return out;
}

// Plan a single mini step-pyramid (mode MANY): keep stacking courses, each
// one smaller than the last, until we've placed enough slots for all the
// repo's commits. Returns flat list of {x, z, course, rotY}.
function planMiniPyramid(baseCols, commitCount, sx, sz) {
  const slots = [];
  let course = 0;
  let cols = baseCols;
  let rows = baseCols; // square base
  const tierInset = 1; // shrink each course by 1 brick per side → taller pyramids

  while (cols >= 3 && rows >= 3) {
    const ox = -(cols - 1) / 2 * sx;
    const oz = -(rows - 1) / 2 * sz;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({ x: ox + c * sx, z: oz + r * sz, course, rotY: 0 });
      }
    }
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
function buildGoldenTiles(stars, startRadius = 17) {
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
    const radius = startRadius + Math.sqrt(i) * 1.6;
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
function buildPillars(forks, radius = 15.5) {
  const n = Math.min(Math.max(forks, 0), 24);
  if (n === 0) return;
  const geo = new THREE.CylinderGeometry(0.42, 0.52, 2.6, 10);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.35, metalness: 0.25 });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.PI / n; // offset so none block the stair
    dummy.position.set(Math.cos(angle) * radius, 1.3, Math.sin(angle) * radius);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.userData = { kind: 'pillars' };
  pillarGroup.add(inst);
  pillarGroup._inst = inst;
}

// ---- STAINED GLASS (languages) — floating sanctum wall ----
// Position is mode-dependent: behind the center pyramid (many mode) or
// behind the grand ziggurat's back face (one mode).
function buildStainedGlass(langBytes, opts = {}) {
  const sorted = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = Object.values(langBytes).reduce((a, b) => a + b, 1) || 1;
  let x = -5;
  const y = opts.y != null ? opts.y : 6.5;
  const z = opts.z != null ? opts.z : -6.4;
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
// TEMPLE LABELS  (Phase 10 — the whole point)
//   • Always visible: repo name · commit count · language-color dot.
//   • No clicking required to know what a temple is.
//   • Click a repo label → that repo's file tree.
//   • Click the apex label (one-temple mode) → separate into per-repo
//     temples. Click it again in many mode → re-merge into one.
//   • Distance-faded in the render loop so far labels never clutter.
// ==================================================================
function makeLabelEl(html, title, onclick) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = html;
  el.title = title;
  el.style.pointerEvents = 'auto';
  el.addEventListener('click', (e) => { e.stopPropagation(); onclick(); });
  return el;
}

function attachLabel(el, x, y, z) {
  const obj = new CSS2DObject(el);
  obj.position.set(x, y, z);
  scene.add(obj);
  labels.push({ obj, el });
  return obj;
}

function clearLabels() {
  labels.forEach(({ obj, el }) => {
    if (obj.parent) obj.parent.remove(obj);
    el.remove();
  });
  labels = [];
}

// one label per repo temple (many mode)
function addRepoLabels(entries) {
  entries.forEach(e => {
    const dot = `<span class="l-dot" style="background:${langColor(e.lang)}"></span>`;
    const html = `${dot}<span class="l-name">${escapeHtml(e.name)}</span><span class="l-n">${e.count.toLocaleString()}</span>`;
    const el = makeLabelEl(html, `${e.name} — ${e.count.toLocaleString()} commits · ${e.lang}`, () => {
      lastBrickRepo = e.name;
      showRepoTree(e.name);
    });
    attachLabel(el, e.x, e.topY + 1.35, e.z);
  });
}

// one big label crowning the unified temple (one mode)
function addUserLabel(login, sub, y) {
  const html = `<span class="l-name">${escapeHtml(login)}</span><span class="l-n">${sub}</span>`;
  const el = makeLabelEl(html, `${login} — click to separate into per-repo temples`, () => {
    switchMode(templeMode === 'one' ? 'many' : 'one');
  });
  el.classList.add('big');
  attachLabel(el, 0, y, 0);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// distance fade, called from animate()
function fadeLabels() {
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i];
    const d = camera.position.distanceTo(L.obj.position);
    let o = 1;
    if (d > LABEL_FADE_START) o = Math.max(0, 1 - (d - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START));
    L.el.style.opacity = o;
    L.el.style.visibility = o <= 0.02 ? 'hidden' : 'visible';
  }
}

// ==================================================================
// MODE SWITCH  (Phase 10)
//   Rebuilds from the cached blueprint — instant, zero API calls.
// ==================================================================
function updateModeButtons() {
  if (modeOneBtn) modeOneBtn.classList.toggle('active', templeMode === 'one');
  if (modeManyBtn) modeManyBtn.classList.toggle('active', templeMode === 'many');
}

function switchMode(mode) {
  if (!templeState || !templeState.blueprint) {
    showToast('Build a temple first.');
    return;
  }
  if (mode === templeMode) return;
  buildTemple(templeState.blueprint, mode);
  showToast(mode === 'one'
    ? 'One grand temple — every repo merged. (M to separate)'
    : 'Separate temples — one per repo. (M to merge)', 'ok', 3500);
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
//   • click a temple label      → repo file-tree preview panel (Phase 10)
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
// RENDER LOOP  (Phase 9 stripped + Phase 10 labels)
//   camera orbit + controls + label fade + render. Nothing else.
// ==================================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // idle auto-orbit (paused while dragging a brick)
  if (!drag && !autoOrbitOn && Date.now() - lastInteraction > IDLE_ORBIT_MS) autoOrbitOn = true;
  if (autoOrbitOn && !drag) {
    const a = Math.atan2(camera.position.x, camera.position.z) + dt * 0.12;
    camera.position.x = Math.sin(a) * orbitR;
    camera.position.z = Math.cos(a) * orbitR;
    camera.position.y = orbitY;
    camera.lookAt(controls.target);
  }

  controls.update();
  fadeLabels();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
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
// DOWNLOAD STANDALONE HTML  (MVP 8 + Phase 10: labels + mode toggle)
// ==================================================================
function downloadStandaloneHTML(bp) {
  const slim = encodeShare(bp);
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FED-TEMPLE — ${bp.user.login}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/FED-OS/FED-TEMPLE@main/styles.css"/>
<script src="https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"></script>
<style>
body{margin:0;overflow:hidden;background:#0d1117;color:#e6edf3;font-family:ui-monospace,Menlo,Consolas,monospace;}
#mt{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:6px;}
#mt button{background:rgba(13,17,23,.88);color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:6px 12px;font:700 11px ui-monospace,monospace;cursor:pointer;}
#mt button.active{background:#f1e05a;color:#000;border-color:#f1e05a;}
.lbl{display:flex;align-items:center;gap:6px;background:rgba(13,17,23,.88);border:1px solid #30363d;border-radius:6px;padding:3px 8px;font:700 10px ui-monospace,monospace;color:#e6edf3;white-space:nowrap;pointer-events:auto;cursor:pointer;}
.lbl:hover{border-color:#f1e05a;}
.lbl .l-dot{width:7px;height:7px;border-radius:50%;}
.lbl .l-n{color:#8b949e;font-weight:400;}
.lbl.big{font-size:12px;padding:5px 10px;}
</style></head><body>
<div id="mt"><button id="mOne" class="active">1 temple</button><button id="mMany">all temples</button></div>
<div id="canvas-container" style="position:fixed;inset:0;"></div>
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DRenderer, CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
const HASH="${slim}";
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
//   Labels live in a separate DOM layer and are not part of the WebGL
//   canvas, so the PNG is always a clean temple render.
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
    buildTemple(bp, templeMode);
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
// build mode toggle (Phase 10)
modeOneBtn.onclick = () => switchMode('one');
modeManyBtn.onclick = () => switchMode('many');
$('resetCam').onclick = () => {
  camera.position.set(orbitR * 0.45, orbitY, orbitR * 0.91);
  controls.target.set(0, templeMode === 'one' ? Math.max(2, (brickGroup._pyramids?.[0]?.topY || 4) * 0.5) : 2, 0);
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
  if (!lastBrickRepo) { showToast('Click a brick or a temple label first.'); return; }
  showRepoTree(lastBrickRepo);
};

// keyboard shortcuts
addEventListener('keydown', (e) => {
  if (e.target === usernameInput) return;
  if (e.key === 'r' || e.key === 'R') $('resetCam').click();
  if (e.key === 's' || e.key === 'S') $('snapshot').click();
  if (e.key === 'h' || e.key === 'H') toggleUi.click();
  if (e.key === 'm' || e.key === 'M') switchMode(templeMode === 'one' ? 'many' : 'one');
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
// Phase 10: BOTH build modes + CSS2D labels, in a compact inline engine.
//   • pyramids ('many'): one per repo, concentric rings, labeled
//   • ziggurat ('one'):  every repo interleaved, stair, apex label
//   • toggle buttons switch instantly; labels open the repo on GitHub
// ==================================================================
const SNAPTIME_INLINE = `
const s=JSON.parse(LZString.decompressFromEncodedURIComponent(HASH));
const bp={user:{login:s.u,name:s.n,avatar:''},repoCount:s.rc,totalCommits:s.tc,
totalStars:s.ts,totalForks:s.tf,languages:s.L,
commits:s.C.map(a=>({m:a[0],d:a[1],lang:a[2],repo:a[3],sha:a[4]})),contributors:s.G||[]};
const LC={'JavaScript':'#f1e05a','TypeScript':'#3178c6','Python':'#4B8BBE','HTML':'e34c26'.length?'#e34c26':'#e34c26','CSS':'#8B5CF6','Shell':'#89e051','Rust':'#dea584','Go':'#00ADD8','Java':'#b07219','C':'#8B8B8B','C++':'#f34b7d','C#':'#178600','Ruby':'#701516','PHP':'#7B8AB8','Vue':'#41b883','Unknown':'#888888'};
const lc=l=>LC[l]||'#888888';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0d1117);
const cam=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,0.1,500);
const ren=new THREE.WebGLRenderer({antialias:false});ren.setPixelRatio(1);ren.setSize(innerWidth,innerHeight);
const cc=document.getElementById('canvas-container');cc.appendChild(ren.domElement);
const lren=new CSS2DRenderer();lren.setSize(innerWidth,innerHeight);
lren.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none;z-index:5';cc.appendChild(lren.domElement);
const ctrl=new OrbitControls(cam,ren.domElement);ctrl.target.set(0,2,0);ctrl.enableDamping=true;ctrl.maxPolarAngle=Math.PI*0.495;ctrl.maxDistance=120;
scene.add(new THREE.AmbientLight(0x556070,0.85));
const sun=new THREE.DirectionalLight(0xfff4e0,1.25);sun.position.set(20,34,16);scene.add(sun);
const g=new THREE.Mesh(new THREE.CircleGeometry(70,48),new THREE.MeshStandardMaterial({color:0x141821,roughness:0.92}));g.rotation.x=-Math.PI/2;scene.add(g);
const dais=new THREE.Mesh(new THREE.CircleGeometry(16,48),new THREE.MeshStandardMaterial({color:0x1c2230}));dais.rotation.x=-Math.PI/2;dais.position.y=0.015;scene.add(dais);
const brickG=new THREE.Group();scene.add(brickG);
const stairG=new THREE.Group();scene.add(stairG);
const tileG=new THREE.Group();scene.add(tileG);
const pilG=new THREE.Group();scene.add(pilG);
let labels=[];
const bw=0.82,bh=0.42,gap=0.05,sx=bw+gap,sz=bw+gap;
function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function addLabel(html,x,y,z,href){const el=document.createElement('div');el.className='lbl';el.innerHTML=html;el.style.pointerEvents='auto';
if(href){el.onclick=()=>window.open(href,'_blank');}const o=new CSS2DObject(el);o.position.set(x,y,z);scene.add(o);labels.push({o,el});}
function clearL(){labels.forEach(L=>{if(L.o.parent)L.o.parent.remove(L.o);L.el.remove();});labels=[];}
function tiles(n,r0){n=Math.min(n,250);if(!n)return;const gi=new THREE.CircleGeometry(0.34,6),gm=new THREE.MeshStandardMaterial({emissive:0xffaa00,emissiveIntensity:.45,roughness:.3,metalness:.7,side:THREE.DoubleSide});
const im=new THREE.InstancedMesh(gi,gm,n),d=new THREE.Object3D(),ca=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3),go=new THREE.Color(0xffd700);
for(let i=0;i<n;i++){const a=i*2.39996,r=r0+Math.sqrt(i)*1.6;d.position.set(Math.cos(a)*r,0.03,Math.sin(a)*r);d.rotation.set(-Math.PI/2,0,a);d.updateMatrix();im.setMatrixAt(i,d.matrix);ca.setXYZ(i,go.r,go.g,go.b);}
im.instanceColor=ca;tileG.add(im);}
function pillars(n,R){n=Math.min(Math.max(n,0),24);if(!n)return;const gi=new THREE.CylinderGeometry(.42,.52,2.6,10),gm=new THREE.MeshStandardMaterial({color:0xdedede,roughness:.35,metalness:.25});
const im=new THREE.InstancedMesh(gi,gm,n),d=new THREE.Object3D();
for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2+Math.PI/n;d.position.set(Math.cos(a)*R,1.3,Math.sin(a)*R);d.updateMatrix();im.setMatrixAt(i,d.matrix);}pilG.add(im);}
function glass(L,y,z){const so=Object.entries(L).sort((a,b)=>b[1]-a[1]).slice(0,6);const t=Object.values(L).reduce((a,b)=>a+b,1)||1;let x=-5;
so.forEach(([l,b])=>{const w=Math.max(.7,(b/t)*9),c=new THREE.Color(lc(l)),gl=new THREE.Mesh(new THREE.PlaneGeometry(w,4.4),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.65,transparent:true,opacity:.85,side:THREE.DoubleSide}));gl.position.set(x+w/2,y,z);scene.add(gl);x+=w+.4;});}
function forge(slots){const n=slots.length;if(!n)return;const gi=new THREE.BoxGeometry(bw,bh,bw),gm=new THREE.MeshStandardMaterial({roughness:.78,metalness:.06});
const im=new THREE.InstancedMesh(gi,gm,n);im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);brickG.add(im);
const ca=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);im.instanceColor=ca;const d=new THREE.Object3D(),c=new THREE.Color();
slots.forEach((s2,i)=>{d.position.set(s2.x,s2.y,s2.z);d.rotation.set(0,s2.rotY||0,0);d.updateMatrix();im.setMatrixAt(i,d.matrix);c.set(lc(s2.c.lang));ca.setXYZ(i,c.r,c.g,c.b);});
im.instanceMatrix.needsUpdate=true;ca.needsUpdate=true;brickG._im=im;
// rise animation
const pos=slots.map(s2=>({x:s2.x,y:-10,ty:s2.y,z:s2.z,rotY:s2.rotY||0}));const pf=Math.max(6,Math.ceil(n/90));let cu=0;const act=[];
(function step(){const t=Math.min(cu+pf,n);for(;cu<t;cu++)act.push(cu);
for(let i=act.length-1;i>=0;i--){const p=pos[act[i]];p.y+=(p.ty-p.y)*.18;d.position.set(p.x,p.y,p.z);d.rotation.set(0,p.rotY,0);d.updateMatrix();im.setMatrixAt(act[i],d.matrix);
if(Math.abs(p.y-p.ty)<=.01){p.y=p.ty;act.splice(i,1);}}
im.instanceMatrix.needsUpdate=true;if(act.length||cu<n)requestAnimationFrame(step);})();}
function mini(bc,cc2){const sl=[];let co=0,cl=bc,rw=bc;while(cl>=3&&rw>=3){const ox=-(cl-1)/2*sx,oz=-(rw-1)/2*sz;
for(let r=0;r<rw;r++)for(let c2=0;c2<cl;c2++)sl.push({x:ox+c2*sx,z:oz+r*sz,course:co});if(sl.length>=cc2)break;co++;cl-=2;rw-=2;}return sl;}
function rings(n){const out=[{x:0,z:0}];if(n<=1)return out;const RR=[15,27,39];let pl=1,ri=0;
while(pl<n&&ri<3){const R=RR[ri],cap=Math.max(1,Math.floor(2*Math.PI*R/12.5)),k=Math.min(cap,n-pl),off=ri*.55;
for(let i=0;i<k;i++){const a=off+(i/k)*Math.PI*2;out.push({x:Math.cos(a)*R,z:Math.sin(a)*R});}pl+=k;ri++;}
let j=0;while(pl<n){const R=39+Math.sqrt(++j)*4.5,a=j*2.39996;out.push({x:Math.cos(a)*R,z:Math.sin(a)*R});pl++;}return out;}
function grand(cnt){const cap=b=>{let t=0,c=b;while(c>=3){t+=c*c;c-=4;}return t;};let b=5;while(cap(b)<cnt&&b<45)b+=2;
const sl=[],crs=[];let co=0,cl=b,rw=b;while(cl>=3&&rw>=3){const ox=-(cl-1)/2*sx,oz=-(rw-1)/2*sz;
for(let r=0;r<rw;r++)for(let c2=0;c2<cl;c2++)sl.push({x:ox+c2*sx,z:oz+r*sz,course:co});crs.push(rw);if(sl.length>=cnt)break;co++;cl-=4;rw-=4;}
return{sl,crs,hw:(b*sx)/2};}
function clearAll(){[brickG,stairG,tileG,pilG].forEach(gg=>{while(gg.children.length){const c=gg.children.pop();c.geometry&&c.geometry.dispose&&c.geometry.dispose();}});
scene.children.slice().forEach(o=>{if(o.isCSS2DObject)o.parent.remove(o);});clearL();}
let mode='one',oR=44,oY=21;
function build(m){mode=m;clearAll();
const byR={};bp.commits.forEach(c=>{const r=c.repo||'unknown';if(!byR[r])byR[r]={name:r,commits:[],lang:c.lang};byR[r].commits.push(c);});
const groups=Object.values(byR).sort((a,b)=>b.commits.length-a.commits.length);
let extent=8;
if(m==='one'){
const pl=grand(bp.commits.length);const slots=[];let topY=0;
for(let i=0;i<Math.min(pl.sl.length,bp.commits.length);i++){const s2=pl.sl[i],c=bp.commits[i],st=(s2.course%2===1)?sx/2:0;
const y=bh/2+s2.course*(bh+gap);if(y>topY)topY=y;slots.push({x:s2.x+st,z:s2.z,y,rotY:0,c});}
forge(slots);
// stair
const steps=pl.crs.length,sgi=new THREE.BoxGeometry(4.4,bh,sz*1.35),sgm=new THREE.MeshStandardMaterial({color:0xdedede,roughness:.35,metalness:.25});
const sim=new THREE.InstancedMesh(sgi,sgm,steps),d2=new THREE.Object3D();
pl.crs.forEach((rw,c2)=>{d2.position.set(0,bh/2+c2*(bh+gap),((rw-1)/2)*sz+sz*.85);d2.updateMatrix();sim.setMatrixAt(c2,d2.matrix);});stairG.add(sim);
tiles(bp.totalStars,Math.max(21,pl.hw+4));pillars(bp.totalForks,Math.max(20,pl.hw+3));glass(bp.languages,topY+1.1,-(pl.hw+1.6));
addLabel('<span class="l-name">'+esc(bp.user.login)+'</span><span class="l-n">'+bp.repoCount+' repos · '+bp.totalCommits.toLocaleString()+' commits</span>',0,topY+2,0,null);
extent=pl.hw+4;oR=Math.max(34,extent*2.2);oY=oR*.48;
cam.position.set(oR*.45,oY,oR*.91);ctrl.target.set(0,Math.max(2,topY*.5),0);
}else{
const pp=rings(groups.length),slots=[];
groups.forEach((grp,gi)=>{if(!grp.commits.length)return;const pos=pp[gi],cc2=grp.commits.length;
const bc=Math.min(13,Math.max(5,Math.round(Math.sqrt(cc2*.5))));const pl=mini(bc,cc2);let topY=0;
for(let i=0;i<Math.min(pl.length,cc2);i++){const s2=pl[i],c=grp.commits[i],st=(s2.course%2===1)?sx/2:0;
const y=bh/2+s2.course*(bh+gap);if(y>topY)topY=y;slots.push({x:pos.x+s2.x+st,z:pos.z+s2.z,y,rotY:0,c});}
const rr=Math.max(Math.abs(pos.x),Math.abs(pos.z)),hw=(bc*sx)/2;extent=Math.max(extent,rr+hw);
addLabel('<span class="l-dot" style="background:'+lc(grp.lang)+'"></span><span class="l-name">'+esc(grp.name)+'</span><span class="l-n">'+cc2.toLocaleString()+'</span>',pos.x,topY+1.35,pos.z,'https://github.com/'+bp.user.login+'/'+grp.name);});
forge(slots);
tiles(bp.totalStars,Math.max(17,extent+2));pillars(bp.totalForks,Math.min(48,extent+3));glass(bp.languages,6.5,-6.4);
oR=Math.min(75,Math.max(36,extent*1.4+10));oY=oR*.42;
cam.position.set(oR*.5,oY,oR*.87);ctrl.target.set(0,2,0);}
ctrl.update();
document.getElementById('mOne').classList.toggle('active',m==='one');
document.getElementById('mMany').classList.toggle('active',m==='many');}
document.getElementById('mOne').onclick=()=>build('one');
document.getElementById('mMany').onclick=()=>build('many');
build('one');
addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();ren.setSize(innerWidth,innerHeight);lren.setSize(innerWidth,innerHeight);});
let autoOn=true,lastInt=Date.now();ren.domElement.addEventListener('pointerdown',()=>{autoOn=false;lastInt=Date.now();});
function a(){requestAnimationFrame(a);if(!autoOn&&Date.now()-lastInt>8000)autoOn=true;
if(autoOn){const ang=Math.atan2(cam.position.x,cam.position.z)+0.005;cam.position.x=Math.sin(ang)*oR;cam.position.z=Math.cos(ang)*oR;cam.position.y=oY;cam.lookAt(ctrl.target);}
ctrl.update();
labels.forEach(L=>{const dd=cam.position.distanceTo(L.o.position);let o=1;if(dd>100)o=Math.max(0,1-(dd-100)/45);L.el.style.opacity=o;L.el.style.visibility=o<=.02?'hidden':'visible';});
ren.render(scene,cam);lren.render(scene,cam);}a();
`;
