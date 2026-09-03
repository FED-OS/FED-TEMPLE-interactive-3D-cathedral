/* ===================================================================
   FED-TEMPLE — temple.js
   The Digital Monument — core engine
   -------------------------------------------------------------------
   Features baked in:
     [MVP 1] Rich loading feedback (progress bar + messages)
     [MVP 2] Graceful error handling (toast)
     [MVP 3] Cancel button (AbortController)
     [MVP 4] Brick-by-brick building animation (queue)
     [MVP 5] Stats panel + interactive language pills
     [MVP 6] Click brick → commit modal with GitHub link
     [MVP 7] Shareable hash link (lz-string, no server)
     [MVP 8] Download standalone HTML (Blob)
     [MVP 9] Responsive + demo mode
     [GEM]   Auto-orbit on idle, ghosts of contributors,
             fallen-ruins empty state, aura ring, hidden relic,
             ASCII loader, localStorage cache, snapshot PNG,
             rate-limit display
   =================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import LZString from 'lz-string';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const MAX_BRICKS = 5000;       // hard cap so the browser doesn't die
const MAX_REPOS_FOR_COMMITS = 5; // top-N repos we paginate commits for
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h localStorage cache
const IDLE_ORBIT_MS = 30000;   // resume auto-orbit after this idle
const INITIAL_ORBIT_MS = 10000; // auto-orbit on first build
const RELIC_THRESHOLD = 5000;  // bricks needed to maybe spawn the relic

// GitHub language → hex color (subset; unknown → slate)
const LANG_COLORS = {
  JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5',
  HTML:'#e34c26', CSS:'#563d7c', Shell:'#89e051', Rust:'#dea584',
  Go:'#00ADD8', Java:'#b07219', C:'#555555', 'C++':'#f34b7d',
  'C#':'#178600', Ruby:'#701516', PHP:'#4F5D95', Vue:'#41b883',
  Svelte:'#ff3e00', Dockerfile:'#384d54', Makefile:'#427819',
  Vue:'#41b883', Kotlin:'#A97BFF', Swift:'#F05138', Dart:'#00B4AB',
  Lua:'#000080', Rascal:'#ff7036', Unknown:'#888888'
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
      langPills = $('lang-pills'), rateInfo = $('rate-info'),
      asciiLoader = $('ascii-loader'), asciiArt = $('ascii-art'),
      asciiStatus = $('ascii-status');

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
let abortCtrl = null;
let scene, camera, renderer, controls, raycaster, pointer, clock;
let brickGroup, tileGroup, pillarGroup, glassGroup, ghostGroup, auraMesh, relicMesh;
let templeState = null;        // { blueprint, dimmedLangs:Set }
let lastInteraction = Date.now();
let autoOrbitOn = false;

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

  // ---- commits (top N repos by stars) ----
  const topRepos = [...repos]
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, MAX_REPOS_FOR_COMMITS);

  const allCommits = [];
  for (let i = 0; i < topRepos.length; i++) {
    if (allCommits.length >= MAX_BRICKS) break;
    const repo = topRepos[i];
    onProgress(`Mining commits: ${repo.name} (${i + 1}/${topRepos.length})`,
               10 + (i / topRepos.length) * 80);
    let p = 1, got = 0;
    while (got < 1200 && allCommits.length < MAX_BRICKS) {
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
          allCommits.push({
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
  }

  // sort commits chronologically (oldest first → bottom of temple)
  allCommits.sort((a, b) => new Date(a.d) - new Date(b.d));

  const blueprint = {
    user: { login: user.login, name: user.name || user.login, avatar: user.avatar_url },
    repoCount: repos.length,
    totalCommits: allCommits.length,
    commits: allCommits.slice(0, MAX_BRICKS),
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
  const commits = [];
  const now = Date.now();
  for (let i = 0; i < 420; i++) {
    commits.push({
      m: ['feat: add temple forge','fix: brick alignment','docs: readme','refactor: aura ring','chore: deps','init: project scaffold','perf: instanced bricks','style: dark theme'][i % 8],
      d: new Date(now - (420 - i) * 86400000 * 3).toISOString(),
      lang: langs[i % langs.length],
      repo: ['monolith','oracle','sigil','forge','ashes'][i % 5],
      sha: (i * 9999).toString(16).padStart(7, '0')
    });
  }
  return {
    user: { login: 'demo', name: 'Demo Builder', avatar: '' },
    repoCount: 5,
    totalCommits: commits.length,
    commits,
    totalStars: 42, totalForks: 9, totalIssues: 3, totalPRs: 17,
    languages: { JavaScript:120, TypeScript:80, Python:60, Rust:40, HTML:30, CSS:20, Shell:10 },
    contributors: [
      { name:'demo', count:300 },{ name:'ghost1', count:80 },
      { name:'phantom', count:40 }
    ]
  };
}

// ==================================================================
// SCENE SETUP
// ==================================================================
function initScene() {
  const container = $('canvas-container');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);
  scene.fog = new THREE.Fog(0x0d1117, 30, 90);

  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(22, 16, 28);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 4, 0);
  controls.maxDistance = 120;
  controls.minDistance = 4;
  controls.maxPolarAngle = Math.PI * 0.495; // don't go under floor

  // lights
  scene.add(new THREE.AmbientLight(0x404060, 0.55));
  const hemi = new THREE.HemisphereLight(0x9bb0ff, 0x1a1a2e, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(18, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  scene.add(sun);

  // ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.9, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // subtle grid
  const grid = new THREE.GridHelper(80, 40, 0x30363d, 0x21262d);
  grid.material.opacity = 0.25; grid.material.transparent = true;
  scene.add(grid);

  // groups
  brickGroup = new THREE.Group(); scene.add(brickGroup);
  tileGroup = new THREE.Group(); scene.add(tileGroup);
  pillarGroup = new THREE.Group(); scene.add(pillarGroup);
  glassGroup = new THREE.Group(); scene.add(glassGroup);
  ghostGroup = new THREE.Group(); scene.add(ghostGroup);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();

  // events
  addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('click', onCanvasClick);
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
  if (auraMesh) { scene.remove(auraMesh); auraMesh.geometry.dispose(); auraMesh.material.dispose(); auraMesh = null; }
  if (relicMesh) { scene.remove(relicMesh); relicMesh.geometry.dispose(); relicMesh.material.dispose(); relicMesh = null; }
}

function buildTemple(bp) {
  clearTemple();
  templeState = { blueprint: bp, dimmedLangs: new Set() };
  renderStats(bp);
  renderLangPills(bp);

  const hasCommits = bp.commits && bp.commits.length > 0;

  if (hasCommits) {
    buildBricks(bp.commits);          // MVP 4: animated
    buildGoldenTiles(bp.totalStars);
    buildPillars(bp.totalForks);
    buildStainedGlass(bp.languages);
    buildAura(bp);
    maybeSpawnRelic(bp.commits.length);
    spawnGhosts(bp.contributors);     // GEM: ghosts
    enableInitialOrbit();
  } else {
    buildRuins();                      // GEM: empty-state ruins
    showToast('No commits found — summoning the fallen ruins.', 'ok', 5000);
  }
}

// ---- BRICKS (animated queue) ----
function buildBricks(commits) {
  const total = commits.length;
  const cols = Math.min(46, Math.max(8, Math.ceil(Math.sqrt(total * 1.8))));
  const rows = Math.ceil(total / cols);
  const bw = 0.82, bh = 0.42, bd = 0.82, gap = 0.06;
  const wallX = cols * (bw + gap);

  // instanced for perf
  const geo = new THREE.BoxGeometry(bw, bh, bd);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.08 });
  const inst = new THREE.InstancedMesh(geo, mat, total);
  inst.castShadow = true; inst.receiveShadow = true;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  brickGroup.add(inst);

  // per-instance color
  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
  inst.instanceColor = colorAttr;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const positions = []; // store for raycasting + userData

  let idx = 0;
  for (let row = 0; row < rows && idx < total; row++) {
    for (let col = 0; col < cols && idx < total; col++) {
      const c = commits[idx];
      // build a hollow rectangular wall: front + back + 2 sides
      const onFront = row < rows;
      let x, z, rotY = 0;
      const perimeter = cols * 2 + rows * 2;
      const linear = col + row * cols; // not used; we stack walls
      // simpler: front wall grows in +Z, back wall in -Z, side walls fill remainder
      const frontCount = cols;
      const backCount = cols;
      const sideCount = (rows - 2) * 2; // interior rows on both sides
      if (idx < frontCount) {
        x = (col - cols / 2) * (bw + gap) + (bw + gap) / 2;
        z = wallX / 2;
      } else if (idx < frontCount + backCount) {
        x = (col - cols / 2) * (bw + gap) + (bw + gap) / 2;
        z = -wallX / 2;
        rotY = Math.PI;
      } else {
        const s = idx - frontCount - backCount;
        const sideRows = rows - 2;
        if (s < sideRows) {
          // left wall
          x = -wallX / 2;
          z = ((s % sideRows) - sideRows / 2) * (bd + gap) + (bd + gap) / 2;
          rotY = Math.PI / 2;
        } else {
          x = wallX / 2;
          z = (((s - sideRows) % sideRows) - sideRows / 2) * (bd + gap) + (bd + gap) / 2;
          rotY = -Math.PI / 2;
        }
      }
      const y = bh / 2 + row * (bh + gap);
      positions.push({ x, z, y: -10, targetY: y, rotY, commit: c, index: idx });
      color.set(langColor(c.lang));
      colorAttr.setXYZ(idx, color.r, color.g, color.b);
      // start hidden below ground
      dummy.position.set(x, -10, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  inst.count = idx;
  inst.instanceMatrix.needsUpdate = true;
  colorAttr.needsUpdate = true;
  brickGroup._inst = inst;
  brickGroup._positions = positions;

  // animate rise (MVP 4)
  animateBrickRise(positions, inst);
}

function animateBrickRise(positions, inst) {
  const dummy = new THREE.Object3D();
  const perFrame = Math.max(6, Math.ceil(positions.length / 90)); // ~1.5s build
  let cursor = 0;
  const risen = new Array(positions.length).fill(false);

  function step() {
    const target = Math.min(cursor + perFrame, positions.length);
    for (; cursor < target; cursor++) {
      risen[cursor] = true;
    }
    // animate risen ones toward targetY
    let allDone = true;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (!risen[i]) { allDone = false; continue; }
      p.y += (p.targetY - p.y) * 0.18;
      if (Math.abs(p.y - p.targetY) > 0.01) allDone = false;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rotY || 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (!allDone || cursor < positions.length) {
      requestAnimationFrame(step);
    }
  }
  step();
}

// z is stored directly on each position (see buildBricks push),
// so the rise animation reads p.z without re-deriving.

// ---- GOLDEN TILES (stars) ----
function buildGoldenTiles(stars) {
  const n = Math.min(stars, 250);
  const geo = new THREE.CircleGeometry(0.34, 6);
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.6,
      roughness: 0.3, metalness: 0.7
    });
    const tile = new THREE.Mesh(geo, mat);
    tile.rotation.x = -Math.PI / 2;
    const angle = i * 2.39996; // golden angle
    const radius = 6 + Math.sqrt(i) * 1.4;
    tile.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
    tile.userData = { kind: 'star', index: i };
    tileGroup.add(tile);
  }
}

// ---- PILLARS (forks) ----
function buildPillars(forks) {
  const n = Math.min(Math.max(forks, 0), 24);
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const radius = 9.5;
    const height = 2.2 + (i % 6) * 0.7 + (forks > 20 ? 1 : 0);
    const geo = new THREE.CylinderGeometry(0.42, 0.52, height, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.35, metalness: 0.25 });
    const pillar = new THREE.Mesh(geo, mat);
    pillar.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
    pillar.castShadow = true;
    pillarGroup.add(pillar);
    // capital
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.3, 1.2),
      mat
    );
    cap.position.set(Math.cos(angle) * radius, height + 0.15, Math.sin(angle) * radius);
    pillarGroup.add(cap);
  }
}

// ---- STAINED GLASS (languages) ----
function buildStainedGlass(langBytes) {
  const sorted = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = Object.values(langBytes).reduce((a, b) => a + b, 1) || 1;
  let x = -5;
  const y = 5.5, z = 0;
  sorted.forEach(([lang, bytes]) => {
    const w = Math.max(0.6, (bytes / total) * 9);
    const c = new THREE.Color(langColor(lang));
    const geo = new THREE.PlaneGeometry(w, 4.2);
    const mat = new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.45,
      transparent: true, opacity: 0.78, side: THREE.DoubleSide,
      roughness: 0.2
    });
    const glass = new THREE.Mesh(geo, mat);
    // place along back wall interior
    glass.position.set(x + w / 2, y, -8.4);
    glassGroup.add(glass);
    // glow light behind
    const light = new THREE.PointLight(c, 0.8, 12);
    light.position.set(x + w / 2, y, -8.7);
    glassGroup.add(light);
    x += w + 0.4;
  });
}

// ---- AURA RING (GEM #6) ----
function buildAura(bp) {
  const recent = bp.commits.slice(-70).length; // last ~70 commits as "week" proxy
  const intensity = Math.min(1, recent / 70);
  const geo = new THREE.TorusGeometry(8.2, 0.06 + intensity * 0.12, 16, 120);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x66ccff, emissive: 0x3399ff,
    emissiveIntensity: 0.4 + intensity * 0.8,
    transparent: true, opacity: 0.55 + intensity * 0.3
  });
  auraMesh = new THREE.Mesh(geo, mat);
  auraMesh.rotation.x = -Math.PI / 2;
  auraMesh.position.y = 0.1;
  scene.add(auraMesh);
}

// ---- HIDDEN RELIC (GEM #9) ----
function maybeSpawnRelic(brickCount) {
  if (brickCount < RELIC_THRESHOLD) return;
  if (Math.random() > 0.05) return; // 5% chance (was 1%, made friendlier)
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2,
    roughness: 0.1, metalness: 0.9
  });
  relicMesh = new THREE.Mesh(geo, mat);
  relicMesh.position.set(0, 6.5, 0);
  relicMesh.userData = { relic: true };
  scene.add(relicMesh);
  // hum light
  const l = new THREE.PointLight(0xffffff, 1.5, 8);
  l.position.copy(relicMesh.position);
  scene.add(l);
  relicMesh._light = l;
}

// ---- GHOSTS (GEM #1) ----
function spawnGhosts(contributors) {
  if (!contributors || !contributors.length) return;
  const top = contributors.slice(0, 8);
  top.forEach((contrib, i) => {
    const opacity = 0.18 + (1 - i / top.length) * 0.25;
    const geo = new THREE.CapsuleGeometry(0.28, 1.1, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9bb0ff, transparent: true, opacity,
      emissive: 0x4466aa, emissiveIntensity: 0.3, roughness: 0.6
    });
    const ghost = new THREE.Mesh(geo, mat);
    const angle = (i / top.length) * Math.PI * 2;
    const r = 6 + Math.random() * 2;
    ghost.position.set(Math.cos(angle) * r, 0.9, Math.sin(angle) * r);
    ghost.userData = { ghost: true, angle, r, speed: 0.1 + Math.random() * 0.15,
                       name: contrib.name, count: contrib.count };
    ghostGroup.add(ghost);
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
    brick.castShadow = true;
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
// INTERACTION — click brick → modal  (MVP 6)
// ==================================================================
let hovered = null;
function onPointerMove(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  lastInteraction = Date.now();
}
function onPointerDown() { lastInteraction = Date.now(); }

function onCanvasClick(e) {
  if (!brickGroup._inst) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(brickGroup._inst);
  if (hit.length) {
    const id = hit[0].instanceId;
    const commit = brickGroup._positions[id]?.commit;
    if (commit) showCommitModal(commit);
    return;
  }
  // relic?
  if (relicMesh) {
    const rHit = raycaster.intersectObject(relicMesh);
    if (rHit.length) {
      showToast('✦ You found the Eternal Commit. You are the 1%.', 'ok', 8000);
      return;
    }
  }
}

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
// AUTO-ORBIT  (GEM #2)
// ==================================================================
function enableInitialOrbit() {
  autoOrbitOn = true;
  setTimeout(() => { if (Date.now() - lastInteraction > INITIAL_ORBIT_MS - 500) autoOrbitOn = false; }, INITIAL_ORBIT_MS);
}

// ==================================================================
// RENDER LOOP
// ==================================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // idle auto-orbit
  if (!autoOrbitOn && Date.now() - lastInteraction > IDLE_ORBIT_MS) autoOrbitOn = true;
  if (autoOrbitOn) {
    const radius = camera.position.length();
    const a = Math.atan2(camera.position.x, camera.position.z) + dt * 0.12;
    camera.position.x = Math.sin(a) * radius;
    camera.position.z = Math.cos(a) * radius;
    camera.lookAt(controls.target);
  }

  // aura spin
  if (auraMesh) auraMesh.rotation.z += dt * 0.15;

  // relic float + spin
  if (relicMesh) {
    relicMesh.rotation.y += dt * 0.8;
    relicMesh.position.y = 6.5 + Math.sin(t * 1.5) * 0.25;
    if (relicMesh._light) relicMesh._light.position.copy(relicMesh.position);
  }

  // ghosts walk
  ghostGroup.children.forEach(g => {
    const ud = g.userData;
    if (!ud.ghost) return;
    ud.angle += dt * ud.speed;
    g.position.x = Math.cos(ud.angle) * ud.r;
    g.position.z = Math.sin(ud.angle) * ud.r;
    g.position.y = 0.9 + Math.sin(t * 2 + ud.angle * 3) * 0.08;
    g.rotation.y = -ud.angle + Math.PI / 2;
  });

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
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/","lz-string":"https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"}}
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
  const kf = $('kofi'); const kfPrev = kf.style.display; kf.style.display = 'none';
  const cr = $('credit'); const crPrev = cr.style.display; cr.style.display = 'none';
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `fed-temple-${templeState?.blueprint.user.login || 'snapshot'}.png`;
  a.click();
  ui.style.display = prevDisplay; tb.style.display = tbPrev;
  kf.style.display = kfPrev; cr.style.display = crPrev;
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
  toggleUi.textContent = ui.classList.contains('collapsed') ? '👁 Show UI' : '👁 Hide UI';
};
$('resetCam').onclick = () => {
  camera.position.set(22, 16, 28);
  controls.target.set(0, 4, 0);
  controls.update();
  autoOrbitOn = false; lastInteraction = Date.now();
};
$('autoRotate').onclick = (e) => {
  autoOrbitOn = !autoOrbitOn;
  lastInteraction = autoOrbitOn ? 0 : Date.now();
  e.target.textContent = autoOrbitOn ? '⏸ Stop Orbit' : '🔄 Auto-Orbit';
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

// keyboard shortcuts (Nice-to-Have #17)
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
  } else {
    // auto-run demo so first-time visitors see magic instantly (MVP 9 default demo)
    runBuild(true);
  }
}

boot();

// placeholder used by downloadStandaloneHTML template (kept simple)
const SNAPTIME_INLINE = `
const s=JSON.parse(LZString.decompressFromEncodedURIComponent(HASH));
const bp={user:{login:s.u,name:s.n,avatar:''},repoCount:s.rc,totalCommits:s.tc,
totalStars:s.ts,totalForks:s.tf,languages:s.L,
commits:s.C.map(a=>({m:a[0],d:a[1],lang:a[2],repo:a[3],sha:a[4]})),contributors:s.G||[]};
const LC={'JavaScript':'#f1e05a','TypeScript':'#3178c6','Python':'#3572A5','HTML':'#e34c26','CSS':'#563d7c','Shell':'#89e051','Rust':'#dea584','Unknown':'#888'};
const lc=l=>LC[l]||'#888';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0d1117);
const cam=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,0.1,500);
cam.position.set(22,16,28);
const ren=new THREE.WebGLRenderer({antialias:true});ren.setSize(innerWidth,innerHeight);
ren.shadowMap.enabled=true;document.getElementById('canvas-container').appendChild(ren.domElement);
const ctrl=new OrbitControls(cam,ren.domElement);ctrl.target.set(0,4,0);ctrl.enableDamping=true;
scene.add(new THREE.AmbientLight(0x404060,0.6));
const sun=new THREE.DirectionalLight(0xfff4e0,1.1);sun.position.set(18,30,14);scene.add(sun);
const g=new THREE.Mesh(new THREE.CircleGeometry(60,64),new THREE.MeshStandardMaterial({color:0x141821}));
g.rotation.x=-Math.PI/2;scene.add(g);
const commits=bp.commits;const cols=Math.min(46,Math.max(8,Math.ceil(Math.sqrt(commits.length*1.8))));
const rows=Math.ceil(commits.length/cols);const bw=0.82,bh=0.42,gap=0.06,wallX=cols*(bw+gap);
const geo=new THREE.BoxGeometry(bw,bh,0.82);
const mat=new THREE.MeshStandardMaterial({roughness:0.7});
const inst=new THREE.InstancedMesh(geo,mat,commits.length);scene.add(inst);
const ca=new THREE.InstancedBufferAttribute(new Float32Array(commits.length*3),3);inst.instanceColor=ca;
const d=new THREE.Object3D();const col=new THREE.Color();
commits.forEach((c,i)=>{const row=Math.floor(i/cols);const onFront=i<cols,onBack=i>=cols&&i<cols*2;
let x,z;if(onFront){x=(i-cols/2)*(bw+gap)+(bw+gap)/2;z=wallX/2;}
else if(onBack){x=((i-cols)-cols/2)*(bw+gap)+(bw+gap)/2;z=-wallX/2;}
else{const sIdx=i-cols*2;const sr=rows-2;x=(sIdx<sr?-wallX/2:wallX/2);
z=((sIdx%sr)-sr/2)*(0.88)+(0.44);}
d.position.set(x,bh/2+row*(bh+gap),z);d.rotation.set(0,onFront?0:onBack?Math.PI:sIdx<sr?Math.PI/2:-Math.PI/2,0);
d.updateMatrix();inst.setMatrixAt(i,d.matrix);col.set(lc(c.lang));ca.setXYZ(i,col.r,col.g,col.b);});
inst.instanceMatrix.needsUpdate=true;ca.needsUpdate=true;
addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();ren.setSize(innerWidth,innerHeight);});
function a(){requestAnimationFrame(a);ctrl.update();ren.render(scene,cam);}a();
`;
