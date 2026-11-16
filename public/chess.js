/*
 * 체스 규칙 엔진 — 브라우저, Web Worker, Node.js(서버)에서 공통으로 사용합니다.
 * 보드 인덱스: 0 = a8, 7 = h8, 56 = a1, 63 = h1
 * 기물: 대문자 = 백, 소문자 = 흑 (P N B R Q K)
 */
(function (root, factory) {
  const Chess = factory();
  if (typeof module === 'object' && module.exports) module.exports = Chess;
  else root.Chess = Chess;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_RULES = {
    castling: true,       // 캐슬링
    enPassant: true,      // 앙파상
    promotion: 'choose',  // 'choose' = 기물 선택, 'queen' = 자동 퀸
    fiftyMove: true,      // 50수 규칙 무승부
    threefold: true,      // 3회 동형 반복 무승부
    insufficient: true,   // 기물 부족 무승부
    time: 0,              // 각자 제한 시간(분), 0 = 무제한
    increment: 0,         // 한 수마다 추가 시간(초)
  };

  const START = 'rnbqkbnr' + 'pppppppp' + '........'.repeat(4) + 'PPPPPPPP' + 'RNBQKBNR';
  const FILES = 'abcdefgh';
  const N_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const K_OFF = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const B_DIR = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const R_DIR = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const Q_DIR = B_DIR.concat(R_DIR);
  const PROMOS = ['q', 'r', 'b', 'n'];

  const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const opp = (c) => (c === 'w' ? 'b' : 'w');
  const sqName = (sq) => FILES[sq & 7] + (8 - (sq >> 3));
  const sqIndex = (s) => (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);

  function normalizeRules(input) {
    const r = Object.assign({}, DEFAULT_RULES, input || {});
    const bool = (v, d) => (typeof v === 'boolean' ? v : d);
    const num = (v, min, max, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
    };
    return {
      castling: bool(r.castling, true),
      enPassant: bool(r.enPassant, true),
      promotion: r.promotion === 'queen' ? 'queen' : 'choose',
      fiftyMove: bool(r.fiftyMove, true),
      threefold: bool(r.threefold, true),
      insufficient: bool(r.insufficient, true),
      time: num(r.time, 0, 180, 0),
      increment: num(r.increment, 0, 60, 0),
    };
  }

  class Chess {
    constructor(rules) {
      this.rules = normalizeRules(rules);
      this.reset();
    }

    static fromMoves(rules, moves) {
      const g = new Chess(rules);
      for (const m of moves || []) if (!g.move(m)) break;
      return g;
    }

    reset() {
      this.board = START.split('').map((c) => (c === '.' ? null : c));
      this.turn = 'w';
      this.castle = { K: true, Q: true, k: true, q: true };
      this.ep = -1;
      this.half = 0;
      this.full = 1;
      this.history = [];
      this._stack = [];
      this.positions = [this.key()];
      this.result = null;
    }

    /** FEN 불러오기 (테스트용) */
    loadFen(fen) {
      const [pos, turn, castField, ep, half, full] = fen.trim().split(/\s+/);
      const cast = castField || '-';
      this.board = [];
      for (const ch of pos.replace(/\//g, '')) {
        if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) this.board.push(null);
        else this.board.push(ch);
      }
      this.turn = turn || 'w';
      this.castle = { K: cast.includes('K'), Q: cast.includes('Q'), k: cast.includes('k'), q: cast.includes('q') };
      this.ep = ep && ep !== '-' ? sqIndex(ep) : -1;
      this.half = +half || 0;
      this.full = +full || 1;
      this.history = [];
      this._stack = [];
      this.positions = [this.key()];
      this.result = null;
      return this;
    }

    get moves() {
      return this.history.map((h) => ({ from: h.rec.from, to: h.rec.to, promo: h.rec.promo }));
    }

    get lastMove() {
      return this.history.length ? this.history[this.history.length - 1].rec : null;
    }

    kingSquare(c) {
      return this.board.indexOf(c === 'w' ? 'K' : 'k');
    }

    isAttacked(sq, by) {
      const b = this.board, r = sq >> 3, f = sq & 7;
      const w = by === 'w';
      const pr = w ? r + 1 : r - 1, P = w ? 'P' : 'p';
      if (pr >= 0 && pr < 8) {
        if (f > 0 && b[pr * 8 + f - 1] === P) return true;
        if (f < 7 && b[pr * 8 + f + 1] === P) return true;
      }
      const N = w ? 'N' : 'n', K = w ? 'K' : 'k';
      for (const [dr, df] of N_OFF) {
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8 && b[nr * 8 + nf] === N) return true;
      }
      for (const [dr, df] of K_OFF) {
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8 && b[nr * 8 + nf] === K) return true;
      }
      const B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
      for (const [dirs, a] of [[B_DIR, B], [R_DIR, R]]) {
        for (const [dr, df] of dirs) {
          let nr = r + dr, nf = f + df;
          while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const p = b[nr * 8 + nf];
            if (p) {
              if (p === a || p === Q) return true;
              break;
            }
            nr += dr;
            nf += df;
          }
        }
      }
      return false;
    }

    inCheck(c = this.turn) {
      const k = this.kingSquare(c);
      return k >= 0 && this.isAttacked(k, opp(c));
    }

    _addPawn(out, from, to, piece, captured, promote) {
      if (promote) for (const pr of PROMOS) out.push({ from, to, piece, captured, promo: pr, flag: null });
      else out.push({ from, to, piece, captured, promo: null, flag: null });
    }

    _pseudo(c, out) {
      const b = this.board, R = this.rules;
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (!p || colorOf(p) !== c) continue;
        const t = p.toUpperCase(), r = sq >> 3, f = sq & 7;
        if (t === 'P') {
          const dir = c === 'w' ? -1 : 1, nr = r + dir;
          if (nr < 0 || nr > 7) continue;
          const last = c === 'w' ? 0 : 7, startR = c === 'w' ? 6 : 1;
          const one = nr * 8 + f;
          if (!b[one]) {
            this._addPawn(out, sq, one, p, null, nr === last);
            const two = one + dir * 8;
            if (r === startR && !b[two]) out.push({ from: sq, to: two, piece: p, captured: null, promo: null, flag: 'double' });
          }
          for (const df of [-1, 1]) {
            const nf = f + df;
            if (nf < 0 || nf > 7) continue;
            const to = nr * 8 + nf, q = b[to];
            if (q) {
              if (colorOf(q) !== c) this._addPawn(out, sq, to, p, q, nr === last);
            } else if (R.enPassant && to === this.ep) {
              out.push({ from: sq, to, piece: p, captured: c === 'w' ? 'p' : 'P', promo: null, flag: 'ep' });
            }
          }
        } else if (t === 'N' || t === 'K') {
          for (const [dr, df] of t === 'N' ? N_OFF : K_OFF) {
            const nr = r + dr, nf = f + df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
            const to = nr * 8 + nf, q = b[to];
            if (!q || colorOf(q) !== c) out.push({ from: sq, to, piece: p, captured: q || null, promo: null, flag: null });
          }
        } else {
          const dirs = t === 'B' ? B_DIR : t === 'R' ? R_DIR : Q_DIR;
          for (const [dr, df] of dirs) {
            let nr = r + dr, nf = f + df;
            while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
              const to = nr * 8 + nf, q = b[to];
              if (!q) out.push({ from: sq, to, piece: p, captured: null, promo: null, flag: null });
              else {
                if (colorOf(q) !== c) out.push({ from: sq, to, piece: p, captured: q, promo: null, flag: null });
                break;
              }
              nr += dr;
              nf += df;
            }
          }
        }
      }
      if (R.castling) this._castles(c, out);
    }

    _castles(c, out) {
      const b = this.board, o = opp(c);
      const ks = c === 'w' ? 60 : 4, K = c === 'w' ? 'K' : 'k', Rk = c === 'w' ? 'R' : 'r';
      if (b[ks] !== K) return;
      const kSide = c === 'w' ? this.castle.K : this.castle.k;
      const qSide = c === 'w' ? this.castle.Q : this.castle.q;
      if (!kSide && !qSide) return;
      if (this.isAttacked(ks, o)) return;
      if (kSide && b[ks + 3] === Rk && !b[ks + 1] && !b[ks + 2] && !this.isAttacked(ks + 1, o) && !this.isAttacked(ks + 2, o)) {
        out.push({ from: ks, to: ks + 2, piece: K, captured: null, promo: null, flag: 'castleK' });
      }
      if (qSide && b[ks - 4] === Rk && !b[ks - 1] && !b[ks - 2] && !b[ks - 3] && !this.isAttacked(ks - 1, o) && !this.isAttacked(ks - 2, o)) {
        out.push({ from: ks, to: ks - 2, piece: K, captured: null, promo: null, flag: 'castleQ' });
      }
    }

    /** 현재 차례의 합법 수 목록. from을 주면 그 칸의 기물만. */
    legalMoves(from = -1) {
      const c = this.turn, pseudo = [], res = [];
      this._pseudo(c, pseudo);
      for (const m of pseudo) {
        if (from >= 0 && m.from !== from) continue;
        this.makeMove(m);
        const k = this.kingSquare(c);
        const ok = k < 0 || !this.isAttacked(k, opp(c));
        this.unmakeMove(m);
        if (ok) res.push(m);
      }
      return res;
    }

    /** 내부용: 검증 없이 수를 둠 (AI 탐색에도 사용). unmakeMove로 되돌림. */
    makeMove(m) {
      const b = this.board, c = colorOf(m.piece);
      this._stack.push({ castle: Object.assign({}, this.castle), ep: this.ep, half: this.half, full: this.full });
      b[m.from] = null;
      if (m.flag === 'ep') b[(m.from & 56) | (m.to & 7)] = null;
      b[m.to] = m.promo ? (c === 'w' ? m.promo.toUpperCase() : m.promo) : m.piece;
      if (m.flag === 'castleK') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
      else if (m.flag === 'castleQ') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
      const cs = this.castle;
      if (m.piece === 'K') cs.K = cs.Q = false;
      else if (m.piece === 'k') cs.k = cs.q = false;
      for (const s of [m.from, m.to]) {
        if (s === 63) cs.K = false;
        else if (s === 56) cs.Q = false;
        else if (s === 7) cs.k = false;
        else if (s === 0) cs.q = false;
      }
      this.ep = m.flag === 'double' ? (m.from + m.to) >> 1 : -1;
      this.half = m.piece === 'P' || m.piece === 'p' || m.captured ? 0 : this.half + 1;
      if (c === 'b') this.full++;
      this.turn = opp(c);
    }

    unmakeMove(m) {
      const b = this.board, u = this._stack.pop(), c = colorOf(m.piece);
      this.castle = u.castle;
      this.ep = u.ep;
      this.half = u.half;
      this.full = u.full;
      this.turn = c;
      b[m.from] = m.piece;
      if (m.flag === 'ep') { b[m.to] = null; b[(m.from & 56) | (m.to & 7)] = m.captured; }
      else b[m.to] = m.captured;
      if (m.flag === 'castleK') { b[m.from + 3] = b[m.from + 1]; b[m.from + 1] = null; }
      else if (m.flag === 'castleQ') { b[m.from - 4] = b[m.from - 1]; b[m.from - 1] = null; }
    }

    /** 수 두기. input: {from, to, promo} (칸은 숫자 또는 'e2' 형식). 불법이면 null. */
    move(input) {
      if (this.result || !input) return null;
      const from = typeof input.from === 'string' ? sqIndex(input.from) : input.from;
      const to = typeof input.to === 'string' ? sqIndex(input.to) : input.to;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return null;
      let promo = String(input.promo || 'q').toLowerCase();
      if (!PROMOS.includes(promo) || this.rules.promotion === 'queen') promo = 'q';
      const legal = this.legalMoves();
      const m = legal.find((x) => x.from === from && x.to === to && (!x.promo || x.promo === promo));
      if (!m) return null;
      let san = this._san(m, legal);
      this.makeMove(m);
      const check = this.inCheck();
      const replies = this.legalMoves();
      if (check) san += replies.length ? '+' : '#';
      const rec = { from: m.from, to: m.to, promo: m.promo, san, piece: m.piece, captured: m.captured, flag: m.flag };
      this.history.push({ m, rec });
      this.positions.push(this.key());
      this.result = this._computeResult(replies, check);
      return rec;
    }

    undo() {
      const h = this.history.pop();
      if (!h) return null;
      this.unmakeMove(h.m);
      this.positions.pop();
      this.result = null;
      return h.rec;
    }

    _san(m, legal) {
      if (m.flag === 'castleK') return 'O-O';
      if (m.flag === 'castleQ') return 'O-O-O';
      const t = m.piece.toUpperCase();
      if (t === 'P') {
        let s = m.captured ? FILES[m.from & 7] + 'x' : '';
        s += sqName(m.to);
        if (m.promo) s += '=' + m.promo.toUpperCase();
        return s;
      }
      let s = t;
      const others = legal.filter((x) => x.piece === m.piece && x.to === m.to && x.from !== m.from);
      if (others.length) {
        const sameFile = others.some((x) => (x.from & 7) === (m.from & 7));
        const sameRank = others.some((x) => x.from >> 3 === m.from >> 3);
        if (!sameFile) s += FILES[m.from & 7];
        else if (!sameRank) s += 8 - (m.from >> 3);
        else s += sqName(m.from);
      }
      if (m.captured) s += 'x';
      return s + sqName(m.to);
    }

    _computeResult(replies, check) {
      if (!replies.length) {
        return check ? { type: 'checkmate', winner: opp(this.turn) } : { type: 'stalemate', winner: null };
      }
      const R = this.rules;
      if (R.insufficient && this.isInsufficientMaterial()) return { type: 'insufficient', winner: null };
      if (R.fiftyMove && this.half >= 100) return { type: 'fifty', winner: null };
      if (R.threefold) {
        const k = this.positions[this.positions.length - 1];
        let n = 0;
        for (const p of this.positions) if (p === k) n++;
        if (n >= 3) return { type: 'threefold', winner: null };
      }
      return null;
    }

    isInsufficientMaterial() {
      const rest = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = this.board[sq];
        if (!p || p === 'K' || p === 'k') continue;
        const t = p.toUpperCase();
        if (t === 'P' || t === 'R' || t === 'Q') return false;
        rest.push({ t, sq });
      }
      if (rest.length <= 1) return true;
      if (rest.every((x) => x.t === 'B')) {
        const shade = (sq) => ((sq >> 3) + (sq & 7)) % 2;
        return rest.every((x) => shade(x.sq) === shade(rest[0].sq));
      }
      return false;
    }

    /** 해당 색이 체크메이트를 만들 기물이 있는지 (시간 초과 판정용) */
    hasMatingMaterial(c) {
      let minors = 0;
      for (const p of this.board) {
        if (!p || colorOf(p) !== c) continue;
        const t = p.toUpperCase();
        if (t === 'P' || t === 'R' || t === 'Q') return true;
        if (t === 'N' || t === 'B') minors++;
      }
      return minors >= 2;
    }

    key() {
      let k = this.board.map((p) => p || '.').join('') + this.turn;
      if (this.rules.castling) {
        const c = this.castle;
        k += (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '');
      }
      if (this.rules.enPassant && this.ep >= 0) {
        const pr = (this.ep >> 3) + (this.turn === 'w' ? 1 : -1);
        const f = this.ep & 7, P = this.turn === 'w' ? 'P' : 'p';
        if ((f > 0 && this.board[pr * 8 + f - 1] === P) || (f < 7 && this.board[pr * 8 + f + 1] === P)) k += 'e' + this.ep;
      }
      return k;
    }
  }

  Chess.DEFAULT_RULES = DEFAULT_RULES;
  Chess.normalizeRules = normalizeRules;
  Chess.colorOf = colorOf;
  Chess.opp = opp;
  Chess.sqName = sqName;
  Chess.sqIndex = sqIndex;
  return Chess;
});
