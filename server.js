import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data
const users = [];
const brackets = [];
const results = []; // { round:1..6, indexInRound, globalIndex, winner }

const ROUND_GAME_COUNTS = [32,16,8,4,2,1];
const ROUND_WEIGHTS = [1,2,4,8,16,32];

// Precompute offsets
const roundOffsets = ROUND_GAME_COUNTS.reduce((acc, n, i) => {
  acc[i] = i === 0 ? 0 : acc[i - 1] + ROUND_GAME_COUNTS[i - 1];
  return acc;
}, []);

const REQUIRED_LEN = ROUND_GAME_COUNTS.reduce((a,b)=>a+b,0); // 63

const toGlobalIndex = (round, indexInRound) =>
  roundOffsets[round - 1] + indexInRound;

function computeLeaderboard() {
  return brackets.map(b => {
    let total = 0;
    const perRound = {};
    results.forEach(r => {
      const pick = b.picks[r.globalIndex];
      if (pick && pick === r.winner) {
        const w = ROUND_WEIGHTS[r.round - 1];
        total += w;
        perRound[r.round] = (perRound[r.round] || 0) + w;
      }
    });
    return { userId: b.userId, total, perRound };
  }).sort((a,b)=> b.total - a.total);
}

// Routes
app.get('/api/health', (_req,res)=>res.json({ ok:true }));

app.post('/api/users', (req,res)=>{
  const { name } = req.body;
  if (!name) return res.status(400).json({ error:'name required' });
  let u = users.find(x=>x.name === name);
  if (!u) {
    u = { id: String(users.length+1), name };
    users.push(u);
  }
  res.json(u);
});

app.post('/api/brackets', (req,res)=>{
  const { userId, picks } = req.body;
  if (!userId) return res.status(400).json({ error:'userId required' });
  if (!Array.isArray(picks)) return res.status(400).json({ error:'picks must be array' });
  if (picks.length !== REQUIRED_LEN) return res.status(400).json({ error:`picks must be length ${REQUIRED_LEN}` });
  let b = brackets.find(br=>br.userId === userId);
  if (!b) {
    b = { id:String(brackets.length+1), userId, picks, submittedAt:new Date().toISOString() };
    brackets.push(b);
  } else {
    b.picks = picks;
    b.submittedAt = new Date().toISOString();
  }
  res.json(b);
});

app.get('/api/brackets', (_req,res)=>res.json(brackets));

app.post('/api/results', (req,res)=>{
  const { round, indexInRound, winner } = req.body;
  if ([round, indexInRound, winner].some(v=>v===undefined))
    return res.status(400).json({ error:'round, indexInRound, winner required' });
  if (round < 1 || round > 6) return res.status(400).json({ error:'round out of range' });
  const maxIdx = ROUND_GAME_COUNTS[round-1]-1;
  if (indexInRound < 0 || indexInRound > maxIdx)
    return res.status(400).json({ error:`indexInRound must be 0..${maxIdx}` });
  const globalIndex = toGlobalIndex(round, indexInRound);
  let r = results.find(g=>g.globalIndex === globalIndex);
  if (!r) {
    r = { round, indexInRound, globalIndex, winner };
    results.push(r);
  } else {
    r.winner = winner;
  }
  res.json(r);
});

app.get('/api/results', (_req,res)=>res.json(results));

app.get('/api/leaderboard', (_req,res)=>{
  res.json(computeLeaderboard());
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> {
  console.log(`Server http://localhost:${PORT}`);
});