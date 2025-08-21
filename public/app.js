/********* State & Constants *********/
const state = {
  user:null,
  currentBracket:null,
  results:[],            // raw server results objects
  resultsSel:null        // structured results selections by round
};

const usersCache = new Map();

// Helper: load all users (assuming endpoint exists)
async function loadUsers(){
  // If you have an /api/users endpoint returning all users; if not, skip.
  if (usersCache.size) return;
  try {
    const res = await fetch('/api/users');
    if(res.ok){
      const arr = await res.json();
      arr.forEach(u=>usersCache.set(u.id,u));
    }
  } catch(e){
    // silent
  }
}

// Compute per-user scores
function computeScoresForBrackets(brackets){
  const results = [];
  // Flatten official winners by round using state.resultsSel
  for (const br of brackets){
    const picks = br.picks || [];
    const perRound = [0,0,0,0,0,0]; // R1..R6
    let offset = 0;
    for(let r=1; r<=6; r++){
      const gameCount = ROUND_GAME_COUNTS[r-1];
      for(let i=0;i<gameCount;i++){
        const official = state.resultsSel[r][i];
        if(!official) continue; // no result yet
        const userPick = picks[offset + i];
        if(userPick && userPick === official){
          perRound[r-1] += ROUND_WEIGHTS[r-1];
        }
      }
      offset += gameCount;
    }
    const total = perRound.reduce((a,b)=>a+b,0);
    results.push({
      userId: br.userId,
      perRound,
      total,
      bracketId: br.id,
      submittedAt: br.submittedAt
    });
  }
  // sort by total desc then name
  results.sort((a,b)=>{
    if(b.total !== a.total) return b.total - a.total;
    const nameA = (usersCache.get(a.userId)?.name || '').toLowerCase();
    const nameB = (usersCache.get(b.userId)?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  return results;
}

// Render leaderboard table
function renderLeaderboardTable(rows){
  const tbody = document.getElementById('leaderboardBody');
  if(!tbody) return;
  tbody.innerHTML = '';
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:1rem;">No brackets</td></tr>';
    return;
  }
  rows.forEach((row, idx)=>{
    const tr = document.createElement('tr');
    if(state.user && row.userId === state.user.id){
      tr.classList.add('me');
    }
    const userName = usersCache.get(row.userId)?.name || row.userId;
    const roundLabels = row.perRound;
    const tds = [
      idx+1,
      userName,
      roundLabels[0],
      roundLabels[1],
      roundLabels[2],
      roundLabels[3],
      roundLabels[4],
      roundLabels[5],
      row.total
    ];
    tds.forEach((val,i)=>{
      const td = document.createElement('td');
      if(i===1) td.style.maxWidth='140px';
      td.textContent = (typeof val==='number') ? String(val) : val;
      if(i>=2 && i<=7 && val===0) td.classList.add('zero');
      if(i===8) td.classList.add('total');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  // Update my score
  if(state.user){
    const mine = rows.find(r=>r.userId===state.user.id);
    if(mine) el('currentUserScore').textContent = mine.total;
  }
}

const ROUND_GAME_COUNTS = [32,16,8,4,2,1];
const ROUND_WEIGHTS = [1,2,4,8,16,32];
const REQUIRED_LEN = ROUND_GAME_COUNTS.reduce((a,b)=>a+b,0);
const GAME_H = 80;      // was 72
const GAP = 28;
const GAME_UNIT = GAME_H + GAP;
const HEADER_OFFSET = 80;
const CONNECT_INSET = 12; // needed by drawConnectors
// Recompute & push CSS vars
const TOTAL_HEIGHT_PX = ROUND_GAME_COUNTS[0]*GAME_UNIT - GAP;
document.documentElement.style.setProperty('--game-total-height', TOTAL_HEIGHT_PX + 'px');
document.documentElement.style.setProperty('--header-offset', HEADER_OFFSET + 'px');

const REGIONS = ['E','W','M','S'];
const REGION_PAIRINGS = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
const ROUND1 = REGIONS.flatMap(region => REGION_PAIRINGS.map(pair => ({
  teams: pair.map(seed => `${region}${seed}`)
})));

function el(id){ return document.getElementById(id); }

const selections = { 1:Array(32).fill(''),2:Array(16).fill(''),3:Array(8).fill(''),4:Array(4).fill(''),5:Array(2).fill(''),6:Array(1).fill('') };
resetResultsSel();

function resetResultsSel(){
  state.resultsSel = { 1:Array(32).fill(''),2:Array(16).fill(''),3:Array(8).fill(''),4:Array(4).fill(''),5:Array(2).fill(''),6:Array(1).fill('') };
}

/********* Utility *********/
function startOffsetOf(round){ return ROUND_GAME_COUNTS.slice(0,round-1).reduce((a,b)=>a+b,0); }
function globalIndexOf(round,index){ return startOffsetOf(round)+index; }
function feederIndices(round, globalIndex){
  if(round===1) return null;
  if(round<=4){
    const prevRound = round-1;
    const prevPerRegion = [8,4,2][prevRound-1] || 8;
    const currPerRegion = [4,2,1][round-2] || 4;
    const localIndex = globalIndex - startOffsetOf(round);
    const regionIndex = Math.floor(localIndex / currPerRegion);
    const idxInRegion = localIndex % currPerRegion;
    const prevRegionOffset = regionIndex * prevPerRegion;
    const g1 = prevRegionOffset + idxInRegion*2;
    const g2 = g1 + 1;
    return [startOffsetOf(prevRound)+g1, startOffsetOf(prevRound)+g2];
  }
  if(round===5){
    const round4Start = startOffsetOf(4);
    const g = globalIndex - startOffsetOf(5);
    return g===0 ? [round4Start, round4Start+1] : [round4Start+2, round4Start+3];
  }
  if(round===6){
    const round5Start = startOffsetOf(5);
    return [round5Start, round5Start+1];
  }
  return null;
}
function roundTitle(r){
  return ['Round 1','Round 2','Sweet 16','Elite 8','Final Four','Champion'][r-1];
}
function computeOptions(baseSel, round, indexInRound){
  if(round===1) return ROUND1[indexInRound].teams;
  const feeders = feederIndices(round, globalIndexOf(round,indexInRound));
  if(!feeders) return [];
  const prevRound = round-1;
  const prevStart = startOffsetOf(prevRound);
  const a = feeders[0]-prevStart;
  const b = feeders[1]-prevStart;
  const teamA = baseSel[prevRound][a] || '';
  const teamB = baseSel[prevRound][b] || '';
  return [teamA,teamB].filter(Boolean);
}
function clearDownstream(baseSel, fromRound){
  for(let r=fromRound+1;r<=6;r++){
    baseSel[r] = baseSel[r].map(()=> '');
  }
}
function buildPicks(){
  return [1,2,3,4,5,6].flatMap(r=>selections[r]);
}
function ensureLength(arr){
  return arr.length<REQUIRED_LEN
    ? arr.concat(Array(REQUIRED_LEN-arr.length).fill(''))
    : arr.slice(0,REQUIRED_LEN);
}

function cloneSelectionsForMy(){
  if(!state.currentBracket){
    return {1:Array(32).fill(''),2:Array(16).fill(''),3:Array(8).fill(''),4:Array(4).fill(''),5:Array(2).fill(''),6:Array(1).fill('')};
  }
  const picks = state.currentBracket.picks;
  const out = {};
  let offset = 0;
  for(let r=1;r<=6;r++){
    const c = ROUND_GAME_COUNTS[r-1];
    out[r] = picks.slice(offset, offset + c);
    offset += c;
  }
  return out;
}

// Renders all three bracket views
function renderAllBrackets(){
  renderInteractiveBracket({
    mountId:'submitBracket',
    connectorsId:'submitConnectors',
    baseSel: selections,
    mode:'submit'
  });
  renderInteractiveBracket({
    mountId:'myBracket',
    connectorsId:'myConnectors',
    baseSel: cloneSelectionsForMy(),
    mode:'read'
  });
  renderInteractiveBracket({
    mountId:'resultsBracket',
    connectorsId:'resultsConnectors',
    baseSel: state.resultsSel,
    mode:'results'
  });
}

/********* Rendering (Generic) *********/
function renderInteractiveBracket({ mountId, connectorsId, baseSel, mode }){
  const mount = el(mountId);
  if(!mount) return;
  mount.innerHTML='';

  mount.classList.remove('mode-submit','mode-read','mode-results');
  mount.classList.add('mode-'+mode);

  const colHeights = TOTAL_HEIGHT_PX;
  mount.style.setProperty('--game-total-height', colHeights+'px');

  for(let round=1; round<=6; round++){
    const col = document.createElement('div');
    col.className = `bracket-column round-${round}`;
    const title = document.createElement('h4');
    title.textContent = roundTitle(round);
    col.appendChild(title);

    const count = ROUND_GAME_COUNTS[round-1];
    for(let i=0;i<count;i++){
      const box = document.createElement('div');
      box.className = 'game';
      box.dataset.round=round;
      box.dataset.index=i;

      // Position
      let topPx;
      if (round === 1) {
        topPx = HEADER_OFFSET + i * GAME_UNIT;
      } else {
        const groupSize = Math.pow(2, round - 1);      // number of Round1 “slots” this game spans
        const blockSize = groupSize * GAME_UNIT;       // vertical span for this game
        topPx = HEADER_OFFSET + i * blockSize + (blockSize / 2 - GAME_H / 2);
      }
      box.style.top = topPx + 'px';

      const label = document.createElement('label');
      label.textContent = `G${i}`;
      box.appendChild(label);

      const currentValue = baseSel[round][i];
      const opts = computeOptions(baseSel, round, i);

      const shell = document.createElement('div');
      shell.className = 'pick-shell';

      if(mode==='read') {
        box.classList.add('readonly');
        if(currentValue){ box.classList.add('filled'); }
        const val = document.createElement('div');
        val.className='value';
        val.textContent = currentValue || (opts.length? '(pending)' : '(wait)');
        shell.appendChild(val);

        // Add correctness classes if an official result exists for this game
        const officialWinner = state.resultsSel[round][i];
        if (officialWinner) {
          if (currentValue && currentValue === officialWinner) {
            box.classList.add('correct');
          } else if (currentValue && currentValue !== officialWinner) {
            box.classList.add('incorrect');
          }
        }
      } else {
        const select = document.createElement('select');
        select.dataset.round=round;
        select.dataset.index=i;

        const blank = document.createElement('option');
        blank.value='';
        blank.textContent = opts.length? '(pick)' : '(wait)';
        select.appendChild(blank);

        opts.forEach(o=>{
          const opt=document.createElement('option');
          opt.value=o; opt.textContent=o; select.appendChild(opt);
        });

        if(currentValue && opts.includes(currentValue)) select.value=currentValue;
        if(currentValue) box.classList.add('filled');

        select.addEventListener('change', async ()=>{
          const old = baseSel[round][i];
          baseSel[round][i] = select.value;
          // Immediate visual feedback (local)
          box.classList.toggle('filled', !!select.value);
          if(old !== select.value){
            clearDownstream(baseSel, round);
            if(mode==='results' && select.value){
              await postResult(round, i, select.value);
              await loadResults();
            }
            renderAllBrackets();
            delayedRedraw();
          }
        });

        shell.appendChild(select);
      }

      box.appendChild(shell);
      col.appendChild(box);
    }
    mount.appendChild(col);
  }
  // Defer connector drawing until after layout (and visibility if tab just activated)
  requestAnimationFrame(() => drawConnectors(mountId, connectorsId, baseSel, mode));
}

function drawConnectors(mountId, svgId, baseSel, mode){
  const svg = el(svgId);
  const root = el(mountId);
  if(!svg || !root) return;
  svg.innerHTML='';
  const containerRect = root.getBoundingClientRect();

  for(let round=1; round<=5; round++){
    const games = root.querySelectorAll(`.game[data-round="${round}"]`);
    games.forEach(g=>{
      const idx = parseInt(g.dataset.index,10);
      const nextIdx = Math.floor(idx/2);
      const nextEl = root.querySelector(`.game[data-round="${round+1}"][data-index="${nextIdx}"]`);
      if(!nextEl) return;

      const gRect = g.getBoundingClientRect();
      const tRect = nextEl.getBoundingClientRect();

      const startX = gRect.right - containerRect.left - CONNECT_INSET;
      const startY = gRect.top + gRect.height/2 - containerRect.top;
      const endX   = tRect.left - containerRect.left + CONNECT_INSET;
      const endY   = tRect.top + tRect.height/2 - containerRect.top;
      const midX   = (startX + endX)/2;

      const d = `M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', d);
      path.classList.add('connector-path');

      const feederChosenA = !!baseSel[round][idx];
      const siblingIdx = idx % 2 === 0 ? idx+1 : idx-1;
      const feederChosenB = !!baseSel[round][siblingIdx];
      const nextChosen = !!baseSel[round+1][nextIdx];

      const shouldHighlight = (mode !== 'read') && feederChosenA && feederChosenB && nextChosen;
      if (shouldHighlight){
        path.classList.add('active');
      }
      svg.appendChild(path);
    });
  }
}

/********* Server Interaction *********/
async function postResult(round,indexInRound,winner){
  await fetch('/api/results',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ round, indexInRound, winner })
  });
}

async function loadResults(){
  const res = await fetch('/api/results');
  state.results = await res.json();
  resetResultsSel();
  state.results.forEach(r=>{
    state.resultsSel[r.round][r.indexInRound] = r.winner;
  });
  // Re-render to update correctness highlighting
  renderAllBrackets();
  delayedRedraw();
}

async function loadUserBracket(){
  if(!state.user) return;
  const res = await fetch('/api/brackets');
  const all = await res.json();
  state.currentBracket = all.find(b=>b.userId===state.user.id) || null;
  if(state.currentBracket){
    // load into selections
    let offset=0;
    for(let r=1;r<=6;r++){
      const c = ROUND_GAME_COUNTS[r-1];
      selections[r] = state.currentBracket.picks.slice(offset, offset+c);
      offset+=c;
    }
  }
}

/********* Actions *********/
el('btnCreateUser').addEventListener('click', async ()=>{
  const name = el('userName').value.trim();
  if(!name) return alert('Enter name');
  const res = await fetch('/api/users',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ name })
  });
  if(!res.ok) return alert('User error');
  state.user = await res.json();
  el('currentUserId').textContent = `${state.user.id} (${state.user.name})`;
  el('btnSubmitBracket').disabled = false;
  await loadUserBracket();
  renderAllBrackets();
  updateMyMeta();
  refreshLeaderboard();
});

el('btnSubmitBracket').addEventListener('click', async ()=>{
  if(!state.user) return alert('Create user first');
  const picks = ensureLength(buildPicks());
  const res = await fetch('/api/brackets',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ userId: state.user.id, picks })
  });
  if(!res.ok){
    const err = await res.json();
    return alert('Error: '+err.error);
  }
  state.currentBracket = await res.json();
  el('submitStatus').textContent = 'Saved '+ new Date().toLocaleTimeString();
  updateMyMeta();
  renderAllBrackets();
  refreshLeaderboard();
});

el('btnRefreshBoard').addEventListener('click', refreshLeaderboard);

function normalizeBracketResponse(data){
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.brackets)) return data.brackets;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

async function refreshLeaderboard(){
  // Do NOT await loadResults here if you call refreshLeaderboard from loadResults already
  await loadUsers();

  let brackets = [];
  try {
    const res = await fetch('/api/brackets');
    if(!res.ok){
      console.warn('Brackets fetch not ok:', res.status, res.statusText);
    } else {
      const raw = await res.json();
      brackets = normalizeBracketResponse(raw);
    }
  } catch(e){
    console.warn('Brackets fetch error:', e);
  }

  // Fallback: ensure at least current bracket appears
  if (state.currentBracket && !brackets.some(b=>b.id === state.currentBracket.id)) {
    brackets.push(state.currentBracket);
  }

  if (!state.resultsSel) {
    // ensure results loaded once
    await loadResults();
  }

  const rows = computeScoresForBrackets(brackets);
  renderLeaderboardTable(rows);
  const stamp = new Date().toLocaleTimeString();
  const last = document.getElementById('lastBoardRefresh');
  if(last) last.textContent = 'Updated ' + stamp;
}

/********* Tabs *********/
const tabButtons = [
  el('tabBtnSubmit'),
  el('tabBtnMy'),
  el('tabBtnResults'),
  el('tabBtnLeaderboard')
];
tabButtons.forEach(btn=>{
  btn.addEventListener('click',()=>{
    const target = btn.dataset.tab;
    tabButtons.forEach(b=>b.classList.toggle('active', b===btn));
    document.querySelectorAll('.tab-content').forEach(sec=>{
      sec.classList.toggle('active', sec.id === 'tab-'+target);
    });
    if(target==='my'){
      // Re-render ONLY my bracket now that it's visible
      renderInteractiveBracket({
        mountId:'myBracket',
        connectorsId:'myConnectors',
        baseSel: cloneSelectionsForMy(),
        mode:'read'
      });
      updateMyMeta();
    } else if(target==='results'){
      renderInteractiveBracket({
        mountId:'resultsBracket',
        connectorsId:'resultsConnectors',
        baseSel: state.resultsSel,
        mode:'results'
      });
    } else if(target==='submit'){
      renderInteractiveBracket({
        mountId:'submitBracket',
        connectorsId:'submitConnectors',
        baseSel: selections,
        mode:'submit'
      });
    } else if(target==='leaderboard'){
      refreshLeaderboard();
    }
    delayedRedraw();
  });
});

// --- (Optional but recommended) add resize & scroll listeners after init to keep connectors aligned:
window.addEventListener('resize', ()=> {
  redrawAllConnectors();
});

function redrawAllConnectors(){
  drawConnectors('submitBracket','submitConnectors', selections, 'submit');
  drawConnectors('myBracket','myConnectors', cloneSelectionsForMy(), 'read');
  drawConnectors('resultsBracket','resultsConnectors', state.resultsSel, 'results');
}

// Attach scroll listener to each wrapper (if they exist)
['submitConnectors','myConnectors','resultsConnectors'].forEach(id=>{
  const svg = el(id);
  if(svg && svg.parentElement){ // parent is bracketWrapper
    svg.parentElement.addEventListener('scroll', ()=> {
      redrawAllConnectors();
    }, { passive:true });
  }
});
/********* Init *********/
(async function init(){
  await loadResults();
  await loadUserBracket();
  renderAllBrackets();
  refreshLeaderboard();
  delayedRedraw();
})();

/********* Random Bracket Auto-Fill *********/
function anyPicksExist() {
  return [1,2,3,4,5,6].some(r => selections[r].some(v => v));
}

function autoFillRandom() {
  // Overwrite all rounds
  for (let r=1; r<=6; r++) {
    const count = ROUND_GAME_COUNTS[r-1];
    for (let i=0; i<count; i++) {
      let options;
      if (r === 1) {
        options = ROUND1[i].teams.slice();
      } else {
        options = computeOptions(selections, r, i);
      }
      if (options.length === 0) {
        selections[r][i] = '';
      } else {
        selections[r][i] = options[Math.floor(Math.random()*options.length)];
      }
    }
  }
}

// Attach handler
const autoFillBtn = document.getElementById('btnAutoFill');
if (autoFillBtn) {
  autoFillBtn.addEventListener('click', () => {
    if (anyPicksExist()) {
      const ok = confirm('Overwrite existing picks with a random bracket?');
      if (!ok) return;
    }
    autoFillRandom();
    renderAllBrackets();
    delayedRedraw();
    const status = document.getElementById('submitStatus');
    if(status) status.textContent = 'Random bracket generated. Review & Submit.';
  });
}