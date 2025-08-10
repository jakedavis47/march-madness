const state = {
  user: null,
  results: [],
  currentRound: 1,
  currentBracket: null
};

const ROUND_GAME_COUNTS = [32,16,8,4,2,1];
const ROUND_WEIGHTS = [1,2,4,8,16,32];
const REQUIRED_LEN = ROUND_GAME_COUNTS.reduce((a,b)=>a+b,0);

const el = id => document.getElementById(id);
const userIdSpan = el('currentUserId');
const lbOut = el('leaderboardOutput');

const REGIONS = ['E','W','M','S'];
const REGION_PAIRINGS = [
  [1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]
];
const ROUND1 = REGIONS.flatMap(region =>
  REGION_PAIRINGS.map(pair => ({
    teams: pair.map(seed => `${region}${seed}`)
  }))
);

const selections = {
  1: Array(32).fill(''),
  2: Array(16).fill(''),
  3: Array(8).fill(''),
  4: Array(4).fill(''),
  5: Array(2).fill(''),
  6: Array(1).fill('')
};

function startOffsetOf(round) {
  return ROUND_GAME_COUNTS.slice(0, round - 1).reduce((a,b)=>a+b,0);
}
function globalIndexOf(round, indexInRound) {
  return startOffsetOf(round) + indexInRound;
}

function feederIndices(round, gameIndexGlobal) {
  if (round === 1) return null;
  // Rounds 1-4 (within regions)
  if (round <= 4) {
    const prevRound = round - 1;
    const prevPerRegion = [8,4,2][prevRound - 1] || 8;
    const currPerRegion = [4,2,1][round - 2] || 4;
    const gamesBeforeThisRound = startOffsetOf(round);
    const localIndex = gameIndexGlobal - gamesBeforeThisRound;
    const regionIndex = Math.floor(localIndex / currPerRegion);
    const indexInsideRegion = localIndex % currPerRegion;
    const prevRegionOffset = regionIndex * prevPerRegion;
    const g1 = prevRegionOffset + indexInsideRegion * 2;
    const g2 = g1 + 1;
    const prevGlobalOffset = startOffsetOf(prevRound);
    return [prevGlobalOffset + g1, prevGlobalOffset + g2];
  }
  // Round 5: semifinals fed by 4 regional champs (round 4)
  if (round === 5) {
    const round4Start = startOffsetOf(4);
    const g = gameIndexGlobal - startOffsetOf(5);
    return g === 0
      ? [round4Start + 0, round4Start + 1]
      : [round4Start + 2, round4Start + 3];
  }
  // Round 6: championship fed by 2 semifinals
  if (round === 6) {
    const round5Start = startOffsetOf(5);
    return [round5Start + 0, round5Start + 1];
  }
  return null;
}

function clearDownstream(fromRound) {
  for (let r = fromRound + 1; r <= 6; r++) {
    selections[r] = selections[r].map(()=> '');
  }
}

function roundTitle(r) {
  return ['Round 1','Round 2','Sweet 16','Elite 8','Final Four','Champion'][r-1] || `R${r}`;
}

function computeOptions(round, indexInRound) {
  if (round === 1) return ROUND1[indexInRound].teams;
  const feeders = feederIndices(round, globalIndexOf(round, indexInRound));
  if (!feeders) return [];
  const prevRound = round - 1;
  const prevStart = startOffsetOf(prevRound);
  const localA = feeders[0] - prevStart;
  const localB = feeders[1] - prevStart;
  const teamA = selections[prevRound][localA] || '';
  const teamB = selections[prevRound][localB] || '';
  return [teamA, teamB].filter(Boolean);
}

function renderBracketBuilder() {
  const mount = el('bracketBuilder');
  if (!mount) return;
  mount.innerHTML = '';
  const bracketEl = document.createElement('div');
  bracketEl.className = 'bracket';

  for (let round = 1; round <= 6; round++) {
    const col = document.createElement('div');
    col.className = `bracket-column round-${round}`;
    const title = document.createElement('h4');
    title.textContent = roundTitle(round);
    col.appendChild(title);

    const gameCount = ROUND_GAME_COUNTS[round - 1];
    for (let i = 0; i < gameCount; i++) {
      const gameBox = document.createElement('div');
      gameBox.className = 'game';

      const label = document.createElement('label');
      label.textContent = `G${i}`;
      gameBox.appendChild(label);

      const select = document.createElement('select');
      select.dataset.round = String(round);
      select.dataset.index = String(i);

      const currentValue = selections[round][i];
      const options = computeOptions(round, i);

      if (currentValue) gameBox.classList.add('filled');
      if (!options.length && round > 1) gameBox.classList.add('pending');
      if (round === 1 && !options.length) gameBox.classList.add('empty');

      const blankOpt = document.createElement('option');
      blankOpt.value = '';
      blankOpt.textContent = options.length ? '(pick)' : '(wait)';
      select.appendChild(blankOpt);

      options.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        select.appendChild(opt);
      });

      if (currentValue && options.includes(currentValue)) {
        select.value = currentValue;
      } else if (currentValue && !options.includes(currentValue)) {
        selections[round][i] = '';
      }

      select.addEventListener('change', () => {
        const old = selections[round][i];
        selections[round][i] = select.value;
        if (old !== select.value) {
          gameBox.classList.add('changed');
          clearDownstream(round);
          renderBracketBuilder();
        }
      });

      gameBox.appendChild(select);

      if (round < 6) {
        const connector = document.createElement('div');
        connector.className = 'connector';
        gameBox.appendChild(connector);
        if (i % 2 === 0) {
          const merge = document.createElement('div');
          merge.className = 'merge-guide';
          gameBox.appendChild(merge);
        }
      }

      col.appendChild(gameBox);
    }
    bracketEl.appendChild(col);
  }
  mount.appendChild(bracketEl);
}

function buildPicksArray() {
  return [1,2,3,4,5,6].flatMap(r => selections[r]);
}

function populateSelectionsFromExisting() {
  if (!state.currentBracket) return;
  const picks = state.currentBracket.picks;
  let offset = 0;
  for (let r=1; r<=6; r++) {
    const count = ROUND_GAME_COUNTS[r-1];
    selections[r] = picks.slice(offset, offset + count);
    offset += count;
  }
}

function ensureLength(arr) {
  if (arr.length < REQUIRED_LEN) {
    return arr.concat(Array(REQUIRED_LEN - arr.length).fill(''));
  }
  return arr.slice(0, REQUIRED_LEN);
}

// User creation
el('btnCreateUser').addEventListener('click', async () => {
  const name = el('userName').value.trim();
  if (!name) return alert('Enter name');
  const res = await fetch('/api/users', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name })
  });
  if (!res.ok) return alert('User error');
  state.user = await res.json();
  userIdSpan.textContent = state.user.id;
  el('btnSubmitBracket').disabled = false;
  await loadUserBracket();
  populateSelectionsFromExisting();
  renderBracketBuilder();
});

// Submit bracket
el('btnSubmitBracket').addEventListener('click', async () => {
  if (!state.user) return alert('Create user first');
  const picks = ensureLength(buildPicksArray());
  const res = await fetch('/api/brackets', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ userId: state.user.id, picks })
  });
  if (!res.ok) {
    const err = await res.json();
    return alert('Error: ' + err.error);
  }
  const bracket = await res.json();
  state.currentBracket = bracket;
  renderCurrentBracket();
  el('submitStatus').textContent = 'Saved at ' + new Date().toLocaleTimeString();
  refreshLeaderboard();
});

// Manual result form
const roundInput = el('resultRound');
const indexInput = el('resultIndex');
const winnerInput = el('resultWinner');
const btnSubmitResult = el('btnSubmitResult');
if (btnSubmitResult) {
  btnSubmitResult.addEventListener('click', async () => {
    const round = Number(roundInput.value);
    const indexInRound = Number(indexInput.value);
    const winner = winnerInput.value.trim();
    if (!winner) return alert('Winner required');
    await submitResult(round, indexInRound, winner);
  });
}

el('btnRefreshBoard').addEventListener('click', refreshLeaderboard);

async function submitResult(round, indexInRound, winner) {
  const res = await fetch('/api/results', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ round, indexInRound, winner })
  });
  if (!res.ok) {
    const err = await res.json();
    alert('Error: ' + err.error);
    return;
  }
  await res.json();
  await fetchResults();
  refreshLeaderboard();
  if (round === state.currentRound) renderRoundGames();
}

async function fetchResults() {
  const res = await fetch('/api/results');
  state.results = await res.json();
}

async function refreshLeaderboard() {
  const res = await fetch('/api/leaderboard');
  const board = await res.json();
  lbOut.textContent = JSON.stringify(board, null, 2);
  if (state.user) {
    const me = board.find(b => b.userId === state.user.id);
    if (me) el('currentUserScore').textContent = me.total;
  }
}

// Round navigation (results viewing)
function buildRoundNav() {
  const nav = el('roundNav');
  if (!nav) return;
  nav.innerHTML = '';
  for (let i=1;i<=6;i++) {
    const btn = document.createElement('button');
    btn.textContent = 'Round ' + i;
    btn.style.fontWeight = (i === state.currentRound) ? '700' : '400';
    btn.addEventListener('click', () => {
      state.currentRound = i;
      buildRoundNav();
      renderRoundGames();
    });
    nav.appendChild(btn);
  }
}

function renderRoundGames() {
  const container = el('roundGames');
  if (!container) return;
  container.innerHTML = '';
  const round = state.currentRound;
  const gameCount = ROUND_GAME_COUNTS[round - 1];
  const startOffset = startOffsetOf(round);
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Game</th><th>Recorded Winner</th><th>Set</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i=0;i<gameCount;i++) {
    const globalIndex = startOffset + i;
    const result = state.results.find(r => r.globalIndex === globalIndex);
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';

    const tdG = document.createElement('td');
    tdG.textContent = `R${round} #${i} (g${globalIndex})`;
    const tdW = document.createElement('td');
    tdW.textContent = result ? result.winner : '—';
    const tdA = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = result ? 'Update' : 'Set';
    btn.addEventListener('click', async () => {
      const winner = prompt('Winner code?', result?.winner || '');
      if (!winner) return;
      await submitResult(round, i, winner.trim());
    });
    tdA.appendChild(btn);

    tr.appendChild(tdG);
    tr.appendChild(tdW);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

// Tabs
const tabButtons = [el('tabBtnSubmit'), el('tabBtnCurrent')];
tabButtons.forEach(btn => {
  btn?.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    tabButtons.forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach(sec => {
      sec.classList.toggle('active', sec.id === 'tab-' + target);
    });
    if (target === 'current') {
      loadUserBracket();
    } else if (target === 'submit') {
      renderBracketBuilder();
    }
  });
});

// Load bracket
async function loadUserBracket() {
  if (!state.user) return;
  const res = await fetch('/api/brackets');
  if (!res.ok) return;
  const all = await res.json();
  const mine = all.find(b => b.userId === state.user.id);
  state.currentBracket = mine || null;
  if (mine) populateSelectionsFromExisting();
  renderCurrentBracket();
  if (document.querySelector('#tab-submit.tab-content.active')) {
    renderBracketBuilder();
  }
}

function renderCurrentBracket() {
  const meta = el('currentBracketMeta');
  const list = el('currentBracketList');
  if (!meta || !list) return;
  if (!state.currentBracket) {
    meta.textContent = 'No bracket submitted.';
    list.textContent = '';
    return;
  }
  const picks = state.currentBracket.picks;
  const filled = picks.filter(p => p).length;
  meta.textContent = `Bracket ID ${state.currentBracket.id} | Picks filled ${filled}/63 | Last submit ${state.currentBracket.submittedAt}`;
  list.textContent = picks.map((p,i)=>`${String(i).padStart(2,'0')}: ${p || '-'}`).join('\n');
}

// Init
(async function init() {
  buildRoundNav();
  await fetchResults();
  renderRoundGames();
  refreshLeaderboard();
  renderBracketBuilder();
})();