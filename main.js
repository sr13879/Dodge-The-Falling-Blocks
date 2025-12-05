// main.js (module) — Desktop version, Supabase-backed player & leaderboard
// IMPORTANT: ensure the tables `players`, `leaderboard`, and `skins` exist in your Supabase project.

const SUPABASE_URL = 'https://umkurrwggozuwzonfwtd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVta3VycndnZ296dXd6b25md3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjEyNjgsImV4cCI6MjA4MDQzNzI2OH0.3pjYdns5TSE_64PpbDFgCSzg68K96k6GgVy-D8wArWA';

const supabase = window.supabase && window.supabase.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

/* ---------------------------
   Canvas & DOM
   --------------------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function fitCanvas(){
  canvas.width = Math.min(window.innerWidth, 1200);
  canvas.height = Math.min(window.innerHeight, 900);
}
fitCanvas();
window.addEventListener('resize', () => { fitCanvas(); player.x = Math.min(player.x, canvas.width - player.width); player.y = canvas.height - 40; });

const usernameScreen = document.getElementById('username-screen');
const usernameInput = document.getElementById('username-input');
const startUsernameBtn = document.getElementById('start-username');

const titleScreen = document.getElementById('title-screen');
const coinCounterTitle = document.getElementById('coin-counter-title');
const colorGrid = document.getElementById('color-grid');
const skinsContainer = document.getElementById('skins');
const uploadSkinInput = document.getElementById('upload-skin');

const coinCounterGame = document.getElementById('coin-counter-game');
const gameOverOverlay = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const goRestart = document.getElementById('go-restart');
const goTitle = document.getElementById('go-title');

const pauseMenu = document.getElementById('pauseMenu');
const pauseResume = document.getElementById('pause-resume');
const pauseRestart = document.getElementById('pause-restart');
const pauseShop = document.getElementById('pause-shop');
const pauseLeader = document.getElementById('pause-leader');
const pauseClose = document.getElementById('pause-close');

const shopModal = document.getElementById('shopModal');
const shopClose = document.getElementById('shop-close');
const shopColorGrid = document.getElementById('shop-color-grid');
const shopSkins = document.getElementById('shop-skins');
const shopUploadSkin = document.getElementById('shop-upload-skin');
const shopClear = document.getElementById('shop-clear');

const leaderModal = document.getElementById('leaderModal');
const leaderList = document.getElementById('leader-list');
const closeLeader = document.getElementById('close-leader');
const clearLeader = document.getElementById('clear-leader');

/* ---------------------------
   Game state (Supabase-backed)
   --------------------------- */
let username = '';
let coins = 0;
let unlockedColors = ['#00FF00'];
let selectedColor = '#00FF00';
let selectedSkinData = null; // data URL
let playerRowId = null;      // players.id (uuid) when created

const shopColors = [
  "#00FF00","#FF0000","#0000FF","#FFFF00","#FF00FF","#00FFFF","#FFA500","#FFFFFF",
  "#D61326","#13C9D6","#44BEC9","#390069","#7773BD","#4A4C78","#261517","#407FC2","#88FF00","#000000",
  "#0800FF","#2E2D57","#422D57","#F700FF","#FF0080"
];
const SKIN_COST = 50000;

let score = 0;
let highScore = 0;

/* Player (half-size) */
const player = { width:25, height:25, x:canvas.width/2 - 12.5, y:canvas.height - 40, speed:5, dx:0, color:'#00FF00', skin:null };

/* Obstacles & powerups */
let obstacles = [];
let powerups = [];
let obstacleSpawnProb = 0.03;
const POWERUP_FREQ = 125;

/* Powerup timers */
let invincible = false, invincibleTimer = 0, INVINCIBLE_DURATION = 5000;
let slowed = false, slowTimer = 0, SLOW_DURATION = 5000;
let speedBoosted = false, speedBoostTimer = 0, SPEEDBOOST_DURATION = 5000;
const SPEEDBOOST_MULT = 1.5;

/* RAF */
let rafId = null;

/* ---------------------------
   Supabase helpers (players/leaderboard/skins)
   --------------------------- */
async function loadOrCreatePlayer(name){
  username = name;
  // local fallback load
  const localCoins = parseInt(localStorage.getItem('coins')||'0',10);
  const localUnlocked = JSON.parse(localStorage.getItem('unlockedColors')||'["#00FF00"]');
  const localColor = localStorage.getItem('selectedColor') || '#00FF00';
  const localSkin = localStorage.getItem('customSkinData') || null;
  const localHigh = parseInt(localStorage.getItem('highScore')||'0',10);

  // attempt Supabase lookup
  if (!supabase) {
    // fallback to local
    coins = localCoins; unlockedColors = localUnlocked; selectedColor = localColor; selectedSkinData = localSkin; highScore = localHigh;
    pushUI();
    return;
  }

  try {
    const { data, error } = await supabase.from('players').select('*').eq('username', username).maybeSingle();
    if (error) {
      console.warn('Supabase players select error:', error);
      coins = localCoins; unlockedColors = localUnlocked; selectedColor = localColor; selectedSkinData = localSkin; highScore = localHigh;
      pushUI();
      return;
    }
    if (data) {
      // populate
      playerRowId = data.id;
      coins = data.coins ?? 0;
      unlockedColors = Array.isArray(data.unlocked_colors) ? data.unlocked_colors : JSON.parse(data.unlocked_colors || '[]');
      selectedColor = data.selected_color || '#00FF00';
      selectedSkinData = data.selected_skin || localSkin;
      highScore = localHigh;
      pushUI();
    } else {
      // create row
      const payload = { username, coins:0, unlocked_colors: JSON.stringify(['#00FF00']), selected_color:'#00FF00', selected_skin:null };
      const { data:inserted, error:insErr } = await supabase.from('players').insert([payload]).select().maybeSingle();
      if (insErr) { console.warn('Supabase insert player error', insErr); coins = localCoins; unlockedColors = localUnlocked; selectedColor = localColor; selectedSkinData = localSkin; highScore = localHigh; pushUI(); return; }
      playerRowId = inserted.id;
      coins = 0; unlockedColors = ['#00FF00']; selectedColor = '#00FF00'; selectedSkinData = null;
      pushUI();
    }
  } catch (e){
    console.error('loadOrCreatePlayer exception', e);
    coins = localCoins; unlockedColors = localUnlocked; selectedColor = localColor; selectedSkinData = localSkin; highScore = localHigh;
    pushUI();
  }
}

async function savePlayerToSupabase(){
  // update supabase row if available; always save localStorage copies
  localStorage.setItem('coins', String(coins));
  localStorage.setItem('unlockedColors', JSON.stringify(unlockedColors));
  localStorage.setItem('selectedColor', selectedColor);
  if (selectedSkinData) localStorage.setItem('customSkinData', selectedSkinData);
  localStorage.setItem('highScore', String(highScore));
  pushUI();

  if (!supabase || !playerRowId) return;
  try {
    const payload = {
      coins,
      unlocked_colors: JSON.stringify(unlockedColors),
      selected_color: selectedColor,
      selected_skin: selectedSkinData || null
    };
    const { error } = await supabase.from('players').update(payload).eq('id', playerRowId);
    if (error) console.warn('savePlayerToSupabase error', error);
  } catch (e){ console.error('savePlayerToSupabase exception', e); }
}

async function submitScoreToSupabase(finalScore){
  if (!supabase) return;
  try {
    const { error } = await supabase.from('leaderboard').insert([{ username, score: finalScore }]);
    if (error) console.warn('submitScoreToSupabase error', error);
  } catch (e){ console.error(e); }
}

async function fetchLeaderboard(limit=50){
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('leaderboard').select('username,score,created_at').order('score', { ascending:false }).limit(limit);
    if (error) { console.warn('fetchLeaderboard error', error); return []; }
    return data || [];
  } catch (e){ console.error(e); return []; }
}

async function uploadSkinToPlayer(dataUrl){
  // store dataUrl in player's selected_skin (and localStorage)
  selectedSkinData = dataUrl;
  localStorage.setItem('customSkinData', dataUrl);
  await savePlayerToSupabase();
  pushUI();
}

/* ---------------------------
   Drawing helpers
   --------------------------- */
function drawPlayer(){
  if (player.skin || selectedSkinData){
    const img = new Image();
    img.src = player.skin || selectedSkinData;
    ctx.drawImage(img, player.x, player.y, player.width, player.height);
    return;
  }
  let fill = selectedColor || player.color;
  if (slowed) fill = 'navy';
  if (invincible) fill = 'cyan';
  ctx.fillStyle = fill;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawPowerupBars(){
  const barW = 40, barH = 6, gap = 4;
  let offsetY = -10;
  const bars = [];
  if (invincible){
    const elapsed = Date.now() - invincibleTimer;
    const remaining = Math.max(0, 1 - elapsed / INVINCIBLE_DURATION);
    bars.push({ color: 'cyan', remaining });
  }
  if (slowed){
    const elapsed = Date.now() - slowTimer;
    const remaining = Math.max(0, 1 - elapsed / SLOW_DURATION);
    bars.push({ color: 'navy', remaining });
  }
  if (speedBoosted){
    const elapsed = Date.now() - speedBoostTimer;
    const remaining = Math.max(0, 1 - elapsed / SPEEDBOOST_DURATION);
    bars.push({ color: 'gold', remaining });
  }
  for (let i=0;i<bars.length;i++){
    const b = bars[i];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(player.x + player.width/2 - barW/2 - 1, player.y + offsetY - 1, barW + 2, barH + 2);
    ctx.fillStyle = b.color;
    ctx.fillRect(player.x + player.width/2 - barW/2, player.y + offsetY, barW * b.remaining, barH);
    offsetY -= (barH + gap);
  }
}

function drawObstacles(){
  for (let i=0;i<obstacles.length;i++){
    const o = obstacles[i];
    ctx.fillStyle = '#F00';
    ctx.fillRect(o.x, o.y, o.w, o.h);
  }
}

function drawPowerups(){
  for (let i=0;i<powerups.length;i++){
    const p = powerups[i];
    if (p.type === 'invincible') ctx.fillStyle = 'cyan';
    else if (p.type === 'slow') ctx.fillStyle = 'navy';
    else if (p.type === 'speed') ctx.fillStyle = 'gold';
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
}

function drawHUD(){
  ctx.fillStyle = '#FFF';
  ctx.font = '16px Arial';
  ctx.fillText('Score: ' + score, 10, 24);
  ctx.fillText('High: ' + highScore, 10, 44);
  ctx.fillStyle = 'gold';
  ctx.fillText('Coins: ' + coins, 10, 68);
}

/* ---------------------------
   Mechanics
   --------------------------- */
function generateObstacle(){
  const w = Math.random() * (canvas.width / 4) + 25;
  const x = Math.random() * (canvas.width - w);
  const speed = (Math.random() * 3.5 + 3) * 0.5;
  obstacles.push({ x, y: -25, w, h:25, speed });
}

function maybeSpawnPowerup(){
  if (Math.random() < 1 / POWERUP_FREQ){
    const types = ['invincible','slow','speed'];
    const type = types[Math.floor(Math.random() * types.length)];
    const size = 15;
    const x = Math.random() * (canvas.width - size);
    powerups.push({ x, y: -size, size, type, speed:1.5 });
  }
}

function updateObstacles(){
  for (let i = obstacles.length-1; i>=0; i--){
    const o = obstacles[i];
    let eff = o.speed;
    if (slowed) eff *= 0.5;
    o.y += eff;
    if (o.y > canvas.height){
      obstacles.splice(i,1);
      score += 1;
      coins += 1;
      if (score > highScore){ highScore = score; }
      // persist locally & remotely
      awaitSavePlayerLocalThenRemote();
    }
  }
}

function awaitSavePlayerLocalThenRemote(){
  // save synchronous to local and then attempt remote update (non-blocking)
  localStorage.setItem('coins', String(coins));
  localStorage.setItem('unlockedColors', JSON.stringify(unlockedColors));
  localStorage.setItem('selectedColor', selectedColor);
  if (selectedSkinData) localStorage.setItem('customSkinData', selectedSkinData);
  localStorage.setItem('highScore', String(highScore));
  pushUI();
  // attempt supabase update asynchronously
  savePlayerToSupabase();
}

function updatePowerups(){
  for (let i = powerups.length-1; i>=0; i--){
    const p = powerups[i];
    p.y += p.speed;
    if (p.y > canvas.height + p.size){ powerups.splice(i,1); continue; }
    if (p.x < player.x + player.width && p.x + p.size > player.x && p.y < player.y + player.height && p.y + p.size > player.y){
      if (p.type === 'invincible'){ invincible = true; invincibleTimer = Date.now(); }
      else if (p.type === 'slow'){ slowed = true; slowTimer = Date.now(); }
      else if (p.type === 'speed'){ if (!speedBoosted) player.speed *= SPEEDBOOST_MULT; speedBoosted = true; speedBoostTimer = Date.now(); }
      powerups.splice(i,1);
    }
  }
}

function checkCollisions(){
  for (let i=0;i<obstacles.length;i++){
    const o = obstacles[i];
    if (!invincible && o.x < player.x + player.width && o.x + o.w > player.x && o.y < player.y + player.height && o.y + o.h > player.y){
      onGameOver();
      return;
    }
  }
}

function updateTimers(){
  if (invincible && Date.now() - invincibleTimer > INVINCIBLE_DURATION) invincible = false;
  if (slowed && Date.now() - slowTimer > SLOW_DURATION) slowed = false;
  if (speedBoosted && Date.now() - speedBoostTimer > SPEEDBOOST_DURATION){ speedBoosted = false; player.speed = 5; }
}

/* ---------------------------
   Leaderboard & UI
   --------------------------- */
async function pushToLeaderboards(finalScore){
  // local save
  const entry = { username: username || 'Player', score: finalScore, date: new Date().toLocaleString() };
  const listLocal = JSON.parse(localStorage.getItem('leaderboard') || '[]');
  listLocal.push(entry);
  localStorage.setItem('leaderboard', JSON.stringify(listLocal.slice(-200)));

  // supabase insert (best-effort)
  if (supabase){
    try {
      const { error } = await supabase.from('leaderboard').insert([{ username, score: finalScore }]);
      if (error) console.warn('Supabase insert leaderboard error', error);
    } catch (e){ console.error(e); }
  }
}

async function renderLeaderboard(){
  leaderList.innerHTML = '<div style="color:var(--muted);padding:8px">Loading...</div>';
  let rows = [];
  if (supabase){
    try { rows = await fetchLeaderboard(50); } catch (e){ rows = []; }
  }
  if (!rows || rows.length === 0){
    const localList = JSON.parse(localStorage.getItem('leaderboard') || '[]').slice(-50).reverse();
    leaderList.innerHTML = '';
    if (!localList.length){ leaderList.innerHTML = '<div style="color:var(--muted);padding:8px">No scores yet</div>'; return; }
    localList.forEach((e,i)=>{
      const div = document.createElement('div'); div.className = 'entry';
      div.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div style="font-weight:bold">${i+1}.</div><div><div style="font-weight:bold">${escapeHtml(e.username)}</div><div class="meta">${e.date}</div></div></div><div style="font-weight:bold">${e.score}</div>`;
      leaderList.appendChild(div);
    });
    return;
  }
  leaderList.innerHTML = '';
  rows.forEach((row,i) => {
    const div = document.createElement('div'); div.className = 'entry';
    div.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div style="font-weight:bold">${i<3?['🥇','🥈','🥉'][i]:(i+1)+'.'}</div><div><div style="font-weight:bold">${escapeHtml(row.username)}</div><div class="meta">${new Date(row.created_at).toLocaleString()}</div></div></div><div style="font-weight:bold">${row.score}</div>`;
    leaderList.appendChild(div);
  });
}

/* ---------------------------
   Shop rendering & purchases
   --------------------------- */
function renderColorGrid(target){
  target.innerHTML = '';
  shopColors.forEach(c => {
    const cell = document.createElement('div');
    cell.className = 'color-cell';
    cell.style.backgroundColor = c;
    if (unlockedColors.includes(c)){
      const chk = document.createElement('div'); chk.className = 'check-overlay'; chk.textContent = '✓'; cell.appendChild(chk);
    } else {
      const overlay = document.createElement('div'); overlay.className = 'price-overlay'; overlay.textContent = '🪙 50'; cell.appendChild(overlay);
    }
    cell.addEventListener('click', async () => {
      if (unlockedColors.includes(c)){
        selectedColor = c; player.skin = null; selectedSkinData = null; await savePlayerToSupabase(); pushUI();
      } else {
        if (coins >= 50){
          coins -= 50; unlockedColors.push(c); await savePlayerToSupabase(); renderColorGrid(colorGrid); renderColorGrid(shopColorGrid); pushUI();
        } else alert('Not enough coins (50).');
      }
    });
    target.appendChild(cell);
  });
}

function renderSkins(target){
  target.innerHTML = '';
  const localCustom = localStorage.getItem('customSkinData');
  const skinsList = [
    { id:'default', cost:0 },
    { id:'special', cost:SKIN_COST }
  ];
  skinsList.forEach(s => {
    const card = document.createElement('div'); card.className = 'skin-card';
    const img = document.createElement('img');
    if (s.id === 'default'){
      const c = document.createElement('canvas'); c.width = 64; c.height = 48; const p = c.getContext('2d'); p.fillStyle = '#00FF00'; p.fillRect(0,0,64,48); img.src = c.toDataURL();
    } else {
      if (localCustom) img.src = localCustom; else { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const p = c.getContext('2d'); p.fillStyle = '#FFD700'; p.fillRect(0,0,64,48); p.fillStyle = '#000'; p.font = '10px Arial'; p.fillText('Custom',6,26); img.src = c.toDataURL(); }
    }
    card.appendChild(img);
    const price = document.createElement('div'); price.style.position='absolute'; price.style.bottom='6px'; price.style.left=0; price.style.right=0; price.style.textAlign='center'; price.style.color='var(--accent)'; price.style.fontSize='12px';
    price.textContent = s.cost ? '🪙 ' + s.cost : 'Owned';
    card.appendChild(price);
    card.addEventListener('click', async () => {
      if (s.id === 'default'){ player.skin = null; selectedSkinData = null; selectedColor = '#00FF00'; await savePlayerToSupabase(); pushUI(); }
      else {
        const data = localStorage.getItem('customSkinData');
        if (!data){ alert('Upload custom skin first.'); return; }
        const unlocked = !!localStorage.getItem('specialUnlocked');
        if (unlocked){ player.skin = data; selectedSkinData = data; await savePlayerToSupabase(); pushUI(); }
        else {
          if (coins >= SKIN_COST){
            if (confirm(`Buy custom skin slot for ${SKIN_COST} coins?`)){
              coins -= SKIN_COST; localStorage.setItem('specialUnlocked','1'); await savePlayerToSupabase(); renderSkins(skinsContainer); renderSkins(shopSkins); pushUI();
            }
          } else alert('Not enough coins.');
        }
      }
    });
    target.appendChild(card);
  });
}

/* upload handlers (store in player's selected_skin and localStorage; also insert into skins table optional) */
uploadSkinInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async (ev) => {
    const dataUrl = ev.target.result;
    // store locally and in player row
    selectedSkinData = dataUrl;
    localStorage.setItem('customSkinData', dataUrl);
    await savePlayerToSupabase();
    // optional: insert into skins table for browsing
    if (supabase){
      try { const { error } = await supabase.from('skins').insert([{ owner_username: username, data_url: dataUrl }]); if (error) console.warn('skins insert err', error); } catch (e){ console.error(e); }
    }
    alert('Custom skin saved and set locally. Buy/select in Skins if needed.');
    renderSkins(skinsContainer);
    renderSkins(shopSkins);
  };
  r.readAsDataURL(f);
});
shopUploadSkin.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async (ev) => {
    const dataUrl = ev.target.result;
    selectedSkinData = dataUrl;
    localStorage.setItem('customSkinData', dataUrl);
    await savePlayerToSupabase();
    if (supabase){
      try { const { error } = await supabase.from('skins').insert([{ owner_username: username, data_url: dataUrl }]); if (error) console.warn('skins insert err', error); } catch (e){ console.error(e); }
    }
    alert('Custom skin uploaded locally.');
    renderSkins(skinsContainer);
    renderSkins(shopSkins);
  };
  r.readAsDataURL(f);
});

/* ---------------------------
   Utilities & input/UI flow
   --------------------------- */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pushUI(){ document.getElementById('coin-counter-game').textContent = 'Coins: ' + coins; coinCounterTitle.textContent = 'Coins: ' + coins; }

/* Continue handler (fixed stacking) */
async function handleContinue(e){
  if (e && e.preventDefault) e.preventDefault();
  const name = usernameInput.value.trim() || 'Player';
  username = name;
  try { usernameInput.blur(); } catch (_){}
  // load/create player from Supabase (or fallback)
  await loadOrCreatePlayer(username);
  // hide username overlay, show title overlay (title has high z but below username)
  setTimeout(()=>{
    usernameScreen.classList.add('hidden');
    titleScreen.classList.remove('hidden');
    // enable canvas interactions now that overlays are hidden
    canvas.style.pointerEvents = 'auto';
    canvas.style.zIndex = 2;
    renderColorGrid(colorGrid);
    renderSkins(skinsContainer);
    renderColorGrid(shopColorGrid);
    renderSkins(shopSkins);
    pushUI();
  }, 120);
}
startUsernameBtn.addEventListener('pointerdown', handleContinue, {passive:false});
startUsernameBtn.addEventListener('click', handleContinue);
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleContinue(e); });

/* Start game from title */
function startGame(){
  if (gameStarted) return;
  gameStarted = true; gamePaused = false; gameOver = false; score = 0;
  obstacles = []; powerups = [];
  titleScreen.classList.add('hidden'); gameOverOverlay.classList.add('hidden');
  coinCounterGame.style.display = 'block';
  player.dx = 0;
  if (!rafId) rafId = requestAnimationFrame(gameLoop);
}
titleScreen.addEventListener('pointerdown', (e) => { e.preventDefault(); startGame(); }, {passive:false});

/* Keyboard controls */
document.addEventListener('keydown', (e) => {
  if (!gameStarted && !titleScreen.classList.contains('hidden') && e.key === '#') startGame();
  if (e.key === 'ArrowLeft') player.dx = -player.speed;
  if (e.key === 'ArrowRight') player.dx = player.speed;
  if (e.key.toLowerCase() === 'r') restartGame();
  if (e.key.toLowerCase() === 'l') openLeaderModal();
  if (e.key.toLowerCase() === 'p'){
    if (!gameStarted) return;
    if (!gamePaused){
      gamePaused = true;
      pauseMenu.classList.remove('hidden');
      if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
    } else resumeGame();
  }
});
document.addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') player.dx = 0; });

/* Pause/resume */
function resumeGame(){ gamePaused=false; pauseMenu.classList.add('hidden'); if (!rafId) rafId = requestAnimationFrame(gameLoop); }
pauseResume.addEventListener('click', resumeGame);
pauseRestart.addEventListener('click', ()=>{ restartGame(); pauseMenu.classList.add('hidden'); });
pauseShop.addEventListener('click', ()=> openShopModal());
pauseLeader.addEventListener('click', ()=> openLeaderModal());
pauseClose.addEventListener('click', ()=> resumeGame());

/* Game over */
async function onGameOver(){
  gameOver = true; gameStarted = false; gamePaused = false;
  finalScoreEl.textContent = String(score);
  await pushToLeaderboards(score);
  gameOverOverlay.classList.remove('hidden');
  coinCounterGame.style.display = 'none';
  if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
}
goRestart.addEventListener('click', ()=> restartGame());
goTitle.addEventListener('click', ()=> { gameOverOverlay.classList.add('hidden'); titleScreen.classList.remove('hidden'); });

/* Shop & leader modals */
function openShopModal(){ shopModal.classList.remove('hidden'); renderColorGrid(shopColorGrid); renderSkins(shopSkins); }
function closeShopModal(){ shopModal.classList.add('hidden'); savePlayerToSupabase(); }
document.getElementById('shop-close').addEventListener('click', closeShopModal);
shopClear.addEventListener('click', ()=> { if (confirm('Clear custom skin & unlock flag?')){ localStorage.removeItem('customSkinData'); localStorage.removeItem('specialUnlocked'); selectedSkinData = null; renderSkins(skinsContainer); renderSkins(shopSkins); } });

async function openLeaderModal(){ await renderLeaderboard(); leaderModal.classList.remove('hidden'); }
document.getElementById('close-leader').addEventListener('click', ()=> leaderModal.classList.add('hidden'));
document.getElementById('clear-leader').addEventListener('click', ()=> { if (confirm('Clear local leaderboard?')){ localStorage.removeItem('leaderboard'); renderLeaderboard(); } });

/* Main game loop */
function gameLoop(){
  if (!gameStarted || gamePaused){ rafId = null; return; }
  if (gameOver){ onGameOver(); rafId = null; return; }

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0,0,canvas.width,canvas.height);

  drawPlayer();
  drawPowerupBars();

  drawObstacles();
  drawPowerups();

  movePlayer();
  // updates that may call supabase internally are async — use synchronous wrapper
  updateObstacles();
  updatePowerups();
  updateTimers();
  checkCollisions();

  if (Math.random() < obstacleSpawnProb) generateObstacle();
  maybeSpawnPowerup();

  drawHUD();

  rafId = requestAnimationFrame(gameLoop);
}

/* helpers */
function movePlayer(){ player.x += player.dx; if (player.x < 0) player.x = 0; if (player.x + player.width > canvas.width) player.x = canvas.width - player.width; }
function restartGame(){ obstacles=[]; powerups=[]; score=0; player.x = canvas.width/2 - player.width/2; player.dx=0; invincible=slowed=speedBoosted=false; gameStarted=true; gamePaused=false; gameOver=false; coinCounterGame.style.display='block'; if (!rafId) rafId = requestAnimationFrame(gameLoop); }

/* init UI */
function initUI(){
  usernameScreen.classList.remove('hidden');
  titleScreen.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  coinCounterGame.style.display = 'none';
  // local placeholders
  coins = parseInt(localStorage.getItem('coins') || '0', 10);
  unlockedColors = JSON.parse(localStorage.getItem('unlockedColors') || '["#00FF00"]');
  selectedColor = localStorage.getItem('selectedColor') || '#00FF00';
  selectedSkinData = localStorage.getItem('customSkinData') || null;
  highScore = parseInt(localStorage.getItem('highScore') || '0', 10);
  pushUI();
  renderColorGrid(colorGrid);
  renderSkins(skinsContainer);
  renderColorGrid(shopColorGrid);
  renderSkins(shopSkins);
}
initUI();

/* small helpers */
function savePlayerToSupabase(){ return savePlayerToSupabaseImpl(); }
async function savePlayerToSupabaseImpl(){
  // save locally first
  localStorage.setItem('coins', String(coins));
  localStorage.setItem('unlockedColors', JSON.stringify(unlockedColors));
  localStorage.setItem('selectedColor', selectedColor);
  if (selectedSkinData) localStorage.setItem('customSkinData', selectedSkinData);
  localStorage.setItem('highScore', String(highScore));
  pushUI();

  if (!supabase || !playerRowId) return;
  try {
    const payload = {
      coins,
      unlocked_colors: JSON.stringify(unlockedColors),
      selected_color: selectedColor,
      selected_skin: selectedSkinData || null
    };
    const { error } = await supabase.from('players').update(payload).eq('id', playerRowId);
    if (error) console.warn('savePlayerToSupabase error', error);
  } catch (e){ console.error(e); }
}

function awaitThenSaveLocal(){ // used by obstacle dodge so UI updates instantly
  localStorage.setItem('coins', String(coins));
  localStorage.setItem('unlockedColors', JSON.stringify(unlockedColors));
  localStorage.setItem('selectedColor', selectedColor);
  if (selectedSkinData) localStorage.setItem('customSkinData', selectedSkinData);
  localStorage.setItem('highScore', String(highScore));
  pushUI();
  // async remote save
  savePlayerToSupabaseImpl();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* expose debug */
window._gameState = () => ({ username, coins, unlockedColors, selectedColor, score, highScore, playerRowId });

/* End of main.js */
