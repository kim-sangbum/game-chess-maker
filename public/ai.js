/* 체스 AI — Web Worker에서 실행됩니다. (알파-베타 탐색 + 정지 탐색 + 반복 심화) */
'use strict';
if (typeof importScripts === 'function') importScripts('chess.js');
const Engine = typeof Chess !== 'undefined' ? Chess : require('./chess.js');

const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const MATE = 100000;

// 백 기준 위치 점수 (인덱스 0 = a8)
const PST = {
  P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  KE: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};

// 난이도: depth = 최대 깊이, noise = 무작위성(센티폰), time = 생각 시간(ms)
const LEVELS = {
  1: { depth: 1, noise: 150, time: 400, quiesce: false },
  2: { depth: 2, noise: 40, time: 800, quiesce: true },
  3: { depth: 3, noise: 10, time: 1500, quiesce: true },
  4: { depth: 6, noise: 0, time: 3000, quiesce: true },
};

function evaluate(g) {
  const b = g.board;
  let s = 0, nonPawn = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (p && p !== 'K' && p !== 'k' && p !== 'P' && p !== 'p') nonPawn += VAL[p.toUpperCase()];
  }
  const endgame = nonPawn <= 1300;
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p) continue;
    const t = p.toUpperCase();
    const table = t === 'K' && endgame ? PST.KE : PST[t];
    if (p === t) s += VAL[t] + table[sq];
    else s -= VAL[t] + table[sq ^ 56];
  }
  return g.turn === 'w' ? s : -s;
}

function orderScore(m) {
  let s = 0;
  if (m.captured) s += 10000 + 10 * VAL[m.captured.toUpperCase()] - VAL[m.piece.toUpperCase()];
  if (m.promo) s += 9000 + VAL[m.promo.toUpperCase()];
  return s;
}

function orderMoves(moves) {
  for (const m of moves) m._o = orderScore(m);
  moves.sort((a, b) => b._o - a._o);
  return moves;
}

class Timeout extends Error {}

function search(g, level) {
  const cfg = LEVELS[level] || LEVELS[2];
  const deadline = Date.now() + cfg.time;
  let nodes = 0, depthNow = 1;

  function checkTime() {
    if (depthNow > 1 && (++nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout();
  }

  function quiesce(alpha, beta, ply, qd) {
    checkTime();
    const stand = evaluate(g);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return alpha;
    const moves = orderMoves(g.legalMoves().filter((m) => m.captured || m.promo));
    for (const m of moves) {
      g.makeMove(m);
      const sc = -quiesce(-beta, -alpha, ply + 1, qd - 1);
      g.unmakeMove(m);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply) {
    checkTime();
    if (depth <= 0) return cfg.quiesce ? quiesce(alpha, beta, ply, 6) : evaluate(g);
    const moves = g.legalMoves();
    if (!moves.length) return g.inCheck() ? -MATE + ply : 0;
    if (g.rules.fiftyMove && g.half >= 100) return 0;
    orderMoves(moves);
    let best = -Infinity;
    for (const m of moves) {
      g.makeMove(m);
      const sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
      g.unmakeMove(m);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  const root = orderMoves(g.legalMoves());
  if (!root.length) return null;
  if (root.length === 1) return root[0];

  // 같은 국면 반복을 피하기 위해 현재까지 나온 국면 기록
  const seen = new Set(g.positions);
  let bestMove = root[0];

  for (depthNow = 1; depthNow <= cfg.depth; depthNow++) {
    try {
      const scored = [];
      let alpha = -Infinity;
      for (const m of root) {
        g.makeMove(m);
        // 노이즈가 있으면 정확한 점수가 필요하므로 전체 창으로 탐색
        let sc = -negamax(depthNow - 1, -Infinity, cfg.noise ? Infinity : -alpha, 1);
        if (seen.has(g.key()) && sc > 0) sc -= 50; // 이기고 있을 때 반복 회피
        g.unmakeMove(m);
        scored.push({ m, sc });
        if (sc > alpha) alpha = sc;
      }
      // 무작위성: 노이즈를 더해 최고 점수 수 선택
      let pick = null, pickScore = -Infinity;
      for (const { m, sc } of scored) {
        const noisy = sc + (cfg.noise ? (Math.random() * 2 - 1) * cfg.noise : 0);
        if (noisy > pickScore) { pickScore = noisy; pick = m; }
      }
      bestMove = pick;
      // 다음 깊이에서 최선수를 먼저 탐색
      root.sort((a, b) => (a === pick ? -1 : b === pick ? 1 : 0));
      if (alpha >= MATE - 100) break;
      if (Date.now() > deadline) break;
    } catch (e) {
      // 시간 초과: 이 깊이는 버리고 직전 깊이의 최선수를 사용 (보드는 이후 사용하지 않음)
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return bestMove;
}

function think(rules, moves, level) {
  const g = Engine.fromMoves(rules, moves);
  if (g.result) return null;
  const snapshot = g.moves;
  let m;
  try {
    m = search(g, level);
  } catch (e) {
    m = null;
  }
  if (!m) {
    // 안전장치: 처음부터 다시 만들어 아무 합법 수나 선택
    const g2 = Engine.fromMoves(rules, snapshot);
    const legal = g2.legalMoves();
    m = legal[Math.floor(Math.random() * legal.length)];
  }
  return m ? { from: m.from, to: m.to, promo: m.promo } : null;
}

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.onmessage = (e) => {
    const { token, rules, moves, level } = e.data;
    self.postMessage({ token, move: think(rules, moves, level) });
  };
} else if (typeof module === 'object') {
  module.exports = { think, search, evaluate };
}
