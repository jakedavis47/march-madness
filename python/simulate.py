#!/usr/bin/env python3
import sys, json, math, random

SEED_BASE = {
    (1,16): 0.99, (2,15): 0.94, (3,14): 0.86, (4,13): 0.79,
    (5,12): 0.64, (6,11): 0.62, (7,10): 0.60, (8,9): 0.52
}

def seed_prob(a, b):
    if a == b: return 0.5
    lo, hi = sorted([a,b])
    base = SEED_BASE.get((lo,hi), 0.55)
    return base if a < b else (1.0 - base)

def logistic(x):
    if x >= 0:
        z = math.exp(-x)
        return 1.0/(1.0+z)
    else:
        z = math.exp(x)
        return z/(1.0+z)

def rating_prob(nameA, nameB, ratings, model):
    rt = (model.get('ratingType') or 'elo').lower()
    scale = float(model.get('scale') or (400 if rt=='elo' else 1.0))
    ra = ratings.get(nameA)
    rb = ratings.get(nameB)
    if ra is None or rb is None:
        return None
    if rt == 'elo':
        d = (float(ra) - float(rb))
        return 1.0 / (1.0 + 10.0 ** (-d / scale))
    if rt in ('barthag','pythag','pyth'):
        pa = min(max(float(ra), 1e-6), 1-1e-6)
        pb = min(max(float(rb), 1e-6), 1-1e-6)
        la = math.log(pa/(1-pa)); lb = math.log(pb/(1-pb))
        return logistic(la - lb)
    # AdjEM diff
    d = (float(ra) - float(rb))
    k = scale if scale else 25.0
    return logistic(d / k)

def pair_prob(seedA, seedB, nameA, nameB, ratings, model):
    mtype = (model.get('type') or 'seed').lower()
    if mtype == 'seed':
        return seed_prob(seedA, seedB)
    if mtype == 'rating':
        p = rating_prob(nameA, nameB, ratings, model)
        return p if p is not None else seed_prob(seedA, seedB)
    if mtype == 'blend':
        alpha = float(model.get('alpha') or 0.7)
        pr = rating_prob(nameA, nameB, ratings, model)
        ps = seed_prob(seedA, seedB)
        return (alpha*pr + (1.0-alpha)*ps) if pr is not None else ps
    return seed_prob(seedA, seedB)

def main():
    payload = json.load(sys.stdin)
    sims = int(payload.get('sims', 0))
    games = payload.get('round1', [])
    ratings = payload.get('ratings') or {}
    model = payload.get('model') or {}
    if payload.get('rng_seed') is not None:
        random.seed(int(payload['rng_seed']))

    # Round 1 probabilities
    r1_probs = []
    for g in games:
        sa = int(g['seedA']); sb = int(g['seedB'])
        ta = g['teamA']; tb = g['teamB']
        pA = pair_prob(sa, sb, ta, tb, ratings, model)
        r1_probs.append({
            'region': g.get('region'),
            'teamA': ta, 'seedA': sa,
            'teamB': tb, 'seedB': sb,
            'pA': round(pA, 4), 'pB': round(1.0 - pA, 4)
        })

    champs = {}
    advancement_counts = {}  # team -> dict counters: r32,s16,e8,ff,champ

    def inc(name, key):
        d = advancement_counts.setdefault(name, {'r32':0,'s16':0,'e8':0,'ff':0,'champ':0})
        d[key] += 1

    if sims and sims > 0:
        # bucket by region and sort to standard order
        regions = {}
        for g in games:
            regions.setdefault(g['region'], []).append(g)
        for r in regions:
            regions[r].sort(key=lambda x: (min(x['seedA'], x['seedB']), max(x['seedA'], x['seedB'])))
        reg_names = sorted(regions.keys())
        ff_pairs = [(reg_names[0], reg_names[1]), (reg_names[2], reg_names[3])] if len(reg_names)==4 else []

        def play_round(pairings):
            nxt = []
            for a, b in pairings:
                p = pair_prob(a['seed'], b['seed'], a['name'], b['name'], ratings, model)
                nxt.append(a if random.random() < p else b)
            return nxt

        def play_region(glist):
            # Build 16-team list
            teams = []
            for g in glist:
                teams.append({'name': g['teamA'], 'seed': g['seedA']})
                teams.append({'name': g['teamB'], 'seed': g['seedB']})
            # R1 -> reached Round of 32
            r32 = play_round([(teams[i], teams[i+1]) for i in range(0,16,2)])
            for t in r32: inc(t['name'], 'r32')
            # R2 -> reached Sweet 16
            s16 = play_round([(r32[i], r32[i+1]) for i in range(0,8,2)])
            for t in s16: inc(t['name'], 's16')
            # R3 -> reached Elite 8
            e8  = play_round([(s16[i], s16[i+1]) for i in range(0,4,2)])
            for t in e8: inc(t['name'], 'e8')
            # Region winner -> Final Four
            reg_champ = e8[0]
            inc(reg_champ['name'], 'ff')
            return reg_champ

        for _ in range(sims):
            winners = { r: play_region(regions[r]) for r in regions }
            if not ff_pairs: continue
            # Final Four
            ff_w = []
            for ra, rb in ff_pairs:
                a, b = winners[ra], winners[rb]
                p = pair_prob(a['seed'], b['seed'], a['name'], b['name'], ratings, model)
                ff_w.append(a if random.random() < p else b)
            # Championship
            a, b = ff_w[0], ff_w[1]
            p = pair_prob(a['seed'], b['seed'], a['name'], b['name'], ratings, model)
            champ = a if random.random() < p else b
            champs[champ['name']] = champs.get(champ['name'], 0) + 1
            inc(champ['name'], 'champ')

    # Normalize advancement to probabilities
    advancement = {}
    if sims and sims > 0:
        for team, cnts in advancement_counts.items():
            advancement[team] = { k: round(v/float(sims), 4) for k,v in cnts.items() }

    json.dump({
        'round1_probs': r1_probs,
        'champion_probs': { k: round(v/float(sims), 4) for k,v in champs.items() } if sims else {},
        'advancement': advancement,
        'sims': sims,
        'used_model': model
    }, sys.stdout)

if __name__ == '__main__':
    main()