'use strict';
/* 체스 클라이언트 — 화면 전환, 보드 렌더링, AI/한 화면/온라인 대전 */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { colorOf, opp } = Chess;

const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
const LEVEL_NAMES = { 1: '쉬움', 2: '보통', 3: '어려움', 4: '매우 어려움' };
const COLOR_NAME = { w: '백', b: '흑' };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
};

const S = {
  screen: 'home',
  name: store.get('chess.name', ''),
  mode: null,            // 'ai' | 'local' | 'online'
  setupMode: null,
  opts: {},
  game: null,
  myColor: null,
  orientation: 'w',
  players: { w: '', b: '' },
  selected: -1,
  targets: [],
  drag: null,
  clocks: null,
  turnStart: 0,
  resultShown: false,
  ai: { worker: null, token: 0, thinking: false },
  // 온라인
  ws: null,
  wsPromise: null,
  rooms: [],
  room: null,
  role: null,
  gameNo: 0,
  clockSnap: null,
  drawOffer: null,
  onlineStatus: null,
  // 3D / 연출 / 소리
  view: store.get('chess.view', '3d'),  // '3d' | '2d'
  fx: store.get('chess.fx', 'normal'),  // 'normal' | 'fast' | 'off'
  gameId: 0,                            // 새 게임마다 증가 (3D 보드 재배치 판단용)
  sfx: { gameId: -1, ply: 0 },          // 2D 효과음용 마지막 수
  theme: 'classic',                     // 'classic' (고전 전투) | 'modern' (현대전)
  themeRoom: null,                      // 전투 모드를 정한 방 (온라인 참가자 초기화용)
};

const FX_NAMES = { normal: '보통', fast: '빠르게', off: '끄기' };
const TEAM_NAME = { w: '초록군', b: '갈색군' };

// ============================================================
// 3D 보드 연결
// ============================================================
function mount3D(container) {
  const B = window.Board3D;
  if (!B || B.failed) return false;
  if (B.ok) return true;
  if (!B.mount(container)) return false;
  B.onSquare = (sq) => handleSquare(sq);
  B.setFx(S.fx);
  return true;
}

function ensure3D() {
  const B = window.Board3D;
  if (S.view !== '3d' || !B) return false;
  if (!B.ok && !B.failed && !mount3D($('#board3d'))) toast('이 기기에서는 3D를 사용할 수 없어 2D로 표시합니다.');
  if (B.ok) B.attach($('#board3d'));
  return B.ok;
}

/** 홈 화면 3D 배경은 PC에서만 (휴대폰·모션 줄이기·3D 불가 → 정지 배경) */
function homeBg3DAllowed() {
  return !matchMedia('(pointer: coarse)').matches && window.innerWidth > 860 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function updateHomeBg() {
  const B = window.Board3D;
  if (S.screen === 'home' && B && homeBg3DAllowed() && mount3D($('#home-3d'))) {
    B.startShowcase($('#home-3d'));
    document.body.classList.add('has-home-3d');
  } else if (B && B.ok && B.showcase) {
    B.stopShowcase();
  }
}

function use3D() {
  return S.view === '3d' && !!window.Board3D && window.Board3D.ok;
}

/** 연출이 끝난 뒤 실행 */
function afterFx(fn, extra = 250) {
  const p = use3D() && S.screen === 'game' ? window.Board3D.whenIdle().then(() => extra + 450) : Promise.resolve(extra);
  p.then((ms) => setTimeout(fn, ms));
}

window.addEventListener('board3d-ready', () => {
  if (S.screen === 'game' && S.game) renderGame();
  if (S.screen === 'home') updateHomeBg();
});

// ============================================================
// 공통 UI
// ============================================================
/** 화면 분위기: 전투 모드에 따라 고전(양피지·금색) / 현대전(카키·스텐실) */
function setUi(theme) {
  const t = theme === 'modern' ? 'modern' : 'classic';
  document.body.dataset.ui = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'modern' ? '#11130d' : '#120e0a';
}

function uiThemeFor(name) {
  if (name === 'game' || name === 'room') return S.theme;
  if (name === 'setup') return S.setupTheme || 'classic';
  return 'classic';
}

function show(name) {
  for (const el of document.querySelectorAll('.screen')) {
    const on = el.id === 'screen-' + name;
    el.hidden = !on;
    if (on && S.screen !== name) {
      el.classList.remove('enter');
      void el.offsetWidth; // 애니메이션 다시 시작
      el.classList.add('enter');
    }
  }
  const B = window.Board3D;
  if (B && B.ok && name !== 'game' && name !== 'home') B.setVisible(false);
  S.screen = name;
  document.body.dataset.screen = name;
  setUi(uiThemeFor(name));
  updateHomeBg();
  renderWho();
  window.scrollTo(0, 0);
}

let toastTimer = 0;
/** 아래쪽 안내. ms = 0 이면 hideToast() 할 때까지 계속 표시 */
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show');
}

function confirmBox(text, opts = {}) {
  return new Promise((resolve) => {
    const m = $('#confirm-modal');
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = opts.yes || '확인';
    $('#confirm-yes').className = 'btn ' + (opts.yesClass || 'danger');
    $('#confirm-no').textContent = opts.no || '취소';
    m.hidden = false;
    const done = (v) => { m.hidden = true; $('#confirm-yes').onclick = $('#confirm-no').onclick = null; resolve(v); };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
  });
}

function renderWho() {
  let html = S.name ? `<span class="pill">${esc(S.name)}</span>` : '';
  if (S.room && ['room', 'game'].includes(S.screen) && S.mode !== 'ai' && S.mode !== 'local') {
    html += `<span class="pill">방 <b>${esc(S.room.id)}</b></span>`;
  }
  $('#who').innerHTML = html;
}

function pieceHtml(p) {
  return Art.piece(p);
}

function fmtClock(ms) {
  if (ms == null) return '';
  const total = Math.ceil(ms / 1000);
  if (ms < 10000) return (Math.max(0, ms) / 1000).toFixed(1);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// 규칙 / 설정 화면
// ============================================================
const RULE_FIELDS = [
  { key: 'castling', label: '캐슬링', desc: '킹과 룩이 함께 움직이는 특수 이동', type: 'bool' },
  { key: 'enPassant', label: '앙파상', desc: '두 칸 전진한 폰을 옆에서 잡기', type: 'bool' },
  { key: 'promotion', label: '프로모션', desc: '끝까지 간 폰의 승진 방식', type: 'select', options: [['choose', '기물 선택'], ['queen', '자동 퀸']] },
  { key: 'fiftyMove', label: '50수 규칙', desc: '50수 동안 잡기·폰 이동 없으면 무승부', type: 'bool' },
  { key: 'threefold', label: '3회 동형 반복', desc: '같은 국면 3번 나오면 무승부', type: 'bool' },
  { key: 'insufficient', label: '기물 부족 무승부', desc: '메이트가 불가능하면 무승부', type: 'bool' },
  { key: 'time', label: '제한 시간', desc: '각자 사용할 수 있는 시간', type: 'select', num: true,
    options: [[0, '무제한'], [1, '1분'], [3, '3분'], [5, '5분'], [10, '10분'], [15, '15분'], [30, '30분'], [60, '60분']] },
  { key: 'increment', label: '수당 추가 시간', desc: '한 수 둘 때마다 더해지는 시간', type: 'select', num: true,
    options: [[0, '없음'], [1, '+1초'], [2, '+2초'], [3, '+3초'], [5, '+5초'], [10, '+10초'], [30, '+30초']] },
];

// 전투 모드: 매번 고전 전투로 시작 (저장하지 않음)
const THEME_OPTIONS = [['classic', '⚔ 고전 전투 (흰색 vs 검은색)'], ['modern', '🪖 현대전 (초록군 vs 갈색군)']];
const THEME_INFO = {
  classic: { name: '고전 전투', desc: '흰색 vs 검은색 · 중세 기사와 성 안뜰' },
  modern: { name: '현대전', desc: '초록군 vs 갈색군 · 장난감 군대와 나무 책상' },
};
const THEME_FIELD = { key: 'theme', label: '전투 모드', desc: '게임 중에는 바꿀 수 없어요', type: 'theme', options: THEME_OPTIONS, def: 'classic', fresh: true };

const MODE_FIELDS = {
  ai: [
    THEME_FIELD,
    { key: 'level', label: 'AI 난이도', type: 'select', num: true, options: [[1, '쉬움'], [2, '보통'], [3, '어려움'], [4, '매우 어려움']], def: 2 },
    { key: 'color', label: '내 기물 색', type: 'select', options: [['w', '백 (선공)'], ['b', '흑 (후공)'], ['random', '무작위']], def: 'w' },
    { key: 'undo', label: '무르기 허용', desc: '내 수와 AI 수를 함께 되돌림', type: 'bool', def: true },
  ],
  local: [
    THEME_FIELD,
    { key: 'undo', label: '무르기 허용', type: 'bool', def: true },
  ],
  online: [
    THEME_FIELD,
    { key: 'roomName', label: '방 이름', type: 'text', wide: true, def: '' },
    { key: 'hostColor', label: '방장 기물 색', type: 'select', options: [['random', '무작위'], ['w', '백 (선공)'], ['b', '흑 (후공)']], def: 'random' },
  ],
};

function themePickHtml(f, value) {
  const cards = f.options.map(([v]) => {
    const info = THEME_INFO[v];
    return `<label class="theme-card ${v === value ? 'sel' : ''}">
      <input type="radio" name="f-${f.key}" value="${v}" ${v === value ? 'checked' : ''}>
      <span class="theme-swatch ${v}">${Art.piece(v === 'classic' ? 'N' : 'n')}</span>
      <span><b class="${v}-name">${info.name}</b><small>${info.desc}</small></span>
    </label>`;
  }).join('');
  return `<div class="theme-pick"><div class="theme-pick-label">${esc(f.label)} <small class="muted">· ${esc(f.desc)}</small></div>${cards}</div>`;
}

function fieldHtml(f, value) {
  if (f.type === 'theme') return themePickHtml(f, value);
  const id = 'f-' + f.key;
  const label = `<span class="opt-label"><label for="${id}">${esc(f.label)}</label>${f.desc ? `<small>${esc(f.desc)}</small>` : ''}</span>`;
  let control = '';
  if (f.type === 'bool') {
    control = `<span class="switch"><input type="checkbox" id="${id}" ${value ? 'checked' : ''}><span></span></span>`;
  } else if (f.type === 'select') {
    control = `<select id="${id}">${f.options.map(([v, t]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  } else {
    control = `<input type="text" id="${id}" maxlength="24" value="${esc(value)}" placeholder="${esc(S.name || '플레이어')}의 방">`;
  }
  return `<div class="opt ${f.wide ? 'wide' : ''}">${label}${control}</div>`;
}

function readFields(fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'theme') {
      const r = document.querySelector(`input[name="f-${f.key}"]:checked`);
      out[f.key] = r ? r.value : f.def;
      continue;
    }
    const el = $('#f-' + f.key);
    if (!el) continue;
    if (f.type === 'bool') out[f.key] = el.checked;
    else if (f.num) out[f.key] = Number(el.value);
    else out[f.key] = el.value.trim();
  }
  return out;
}

function openSetup(mode) {
  S.setupMode = mode;
  $('#setup-title').textContent = { ai: '컴퓨터와 대전 — 설정', local: '한 화면 2인 대전 — 설정', online: '방 만들기' }[mode];
  $('#setup-go-label').textContent = mode === 'online' ? '방 만들기' : '게임 시작';
  S.setupTheme = 'classic';
  const savedMode = store.get('chess.setup.' + mode, {});
  const savedRules = Object.assign({}, Chess.DEFAULT_RULES, store.get('chess.rules', {}));
  $('#setup-mode').innerHTML = MODE_FIELDS[mode].map((f) => fieldHtml(f, f.fresh ? f.def : savedMode[f.key] ?? f.def)).join('');
  $('#setup-rules').innerHTML = RULE_FIELDS.map((f) => fieldHtml(f, savedRules[f.key])).join('');
  show('setup');
}

function rulesChips(r) {
  const chips = [];
  const onoff = (on, label) => chips.push(`<span class="chip ${on ? '' : 'off'}">${label}</span>`);
  onoff(r.castling, '캐슬링');
  onoff(r.enPassant, '앙파상');
  chips.push(`<span class="chip">프로모션: ${r.promotion === 'queen' ? '자동 퀸' : '선택'}</span>`);
  onoff(r.fiftyMove, '50수 규칙');
  onoff(r.threefold, '3회 반복');
  onoff(r.insufficient, '기물 부족');
  chips.push(`<span class="chip">⏱ ${r.time ? `${r.time}분${r.increment ? ` +${r.increment}초` : ''}` : '무제한'}</span>`);
  return chips.join('');
}

async function submitSetup() {
  const mode = S.setupMode;
  const modeVals = readFields(MODE_FIELDS[mode]);
  const rules = Chess.normalizeRules(readFields(RULE_FIELDS));
  const toSave = Object.assign({}, modeVals);
  for (const f of MODE_FIELDS[mode]) if (f.fresh) delete toSave[f.key];
  store.set('chess.setup.' + mode, toSave);
  store.set('chess.rules', rules);
  if (mode === 'online') {
    if (!(await ensureOnline())) return;
    S.theme = modeVals.theme;
    S.themeRoom = null;
    wsSend({ type: 'createRoom', name: modeVals.roomName, hostColor: modeVals.hostColor, rules });
  } else {
    startLocalGame(mode, rules, modeVals);
  }
}

// ============================================================
// 로컬 게임 (AI / 한 화면)
// ============================================================
function startLocalGame(mode, rules, opts) {
  cancelAi();
  S.mode = mode;
  S.opts = opts;
  S.game = new Chess(rules);
  S.gameId++;
  S.theme = opts.theme === 'modern' ? 'modern' : 'classic';
  S.selected = -1;
  S.targets = [];
  S.resultShown = false;
  S.drawOffer = null;
  if (mode === 'ai') {
    S.myColor = opts.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : opts.color;
    const aiName = `컴퓨터 (${LEVEL_NAMES[opts.level] || '보통'})`;
    S.players = S.myColor === 'w' ? { w: S.name || '나', b: aiName } : { w: aiName, b: S.name || '나' };
    S.orientation = S.myColor;
  } else {
    S.myColor = null;
    S.players = { w: '백', b: '흑' };
    S.orientation = 'w';
  }
  const t = S.game.rules.time;
  S.clocks = t > 0 ? { w: t * 60000, b: t * 60000 } : null;
  S.turnStart = Date.now();
  hideGameOver();
  show('game');
  renderGame();
  maybeAiMove();
}

function remaining(c) {
  if (S.mode === 'online') {
    const s = S.clockSnap;
    if (!s) return null;
    let v = s[c];
    if (s.running && s.turn === c && !S.game.result) v -= Date.now() - s.at;
    return Math.max(0, v);
  }
  if (!S.clocks) return null;
  let v = S.clocks[c];
  if (!S.game.result && S.game.turn === c) v -= Date.now() - S.turnStart;
  return Math.max(0, v);
}

/** 수를 둔 쪽의 시계 정산 (로컬 게임) */
function settleLocalClock(mover) {
  if (!S.clocks) return;
  const now = Date.now();
  S.clocks[mover] = Math.max(0, S.clocks[mover] - (now - S.turnStart)) + S.game.rules.increment * 1000;
  S.turnStart = now;
}

function freezeLocalClock() {
  if (!S.clocks || S.game.result) return;
  const t = S.game.turn;
  S.clocks[t] = remaining(t);
  S.turnStart = Date.now();
}

function endLocal(result) {
  freezeLocalClock();
  cancelAi();
  S.game.result = result;
  S.selected = -1;
  S.targets = [];
  onGameOver();
}

// ---------- AI ----------
function getWorker() {
  if (S.ai.worker) return S.ai.worker;
  try {
    const w = new Worker('ai.js');
    w.onmessage = (e) => onAiResult(e.data);
    w.onerror = () => {
      toast('AI를 불러오지 못했습니다. 서버(npm start)로 실행해 주세요.');
      S.ai.worker = null;
      fallbackAiMove();
    };
    S.ai.worker = w;
    return w;
  } catch {
    return null;
  }
}

function cancelAi() {
  S.ai.token++;
  if (S.ai.thinking && S.ai.worker) {
    S.ai.worker.terminate();
    S.ai.worker = null;
  }
  S.ai.thinking = false;
}

function maybeAiMove() {
  const g = S.game;
  if (S.mode !== 'ai' || !g || g.result || g.turn === S.myColor) return;
  const token = ++S.ai.token;
  S.ai.thinking = true;
  S.ai.started = Date.now();
  renderStatus();
  renderControls();
  const w = getWorker();
  if (!w) return fallbackAiMove();
  w.postMessage({ token, rules: g.rules, moves: g.moves, level: S.opts.level });
}

function fallbackAiMove() {
  const legal = S.game.legalMoves();
  const m = legal[Math.floor(Math.random() * legal.length)];
  onAiResult({ token: S.ai.token, move: m ? { from: m.from, to: m.to, promo: m.promo } : null });
}

function onAiResult({ token, move }) {
  if (token !== S.ai.token) return;
  const wait = Math.max(0, 350 - (Date.now() - (S.ai.started || 0)));
  setTimeout(() => {
    if (token !== S.ai.token) return;
    S.ai.thinking = false;
    const g = S.game;
    if (!move || g.result) return renderGame();
    const mover = g.turn;
    if (g.move(move)) settleLocalClock(mover);
    renderGame();
    if (g.result) onGameOver();
  }, wait);
}

// ============================================================
// 수 두기 / 입력
// ============================================================
function canInteract() {
  const g = S.game;
  if (!g || g.result || S.screen !== 'game') return false;
  if (S.mode === 'local') return true;
  if (S.mode === 'ai') return !S.ai.thinking && g.turn === S.myColor;
  if (S.mode === 'online') return S.onlineStatus === 'playing' && g.turn === S.myColor;
  return false;
}

function select(sq) {
  S.selected = sq;
  S.targets = sq >= 0 ? S.game.legalMoves(sq) : [];
}

/** 칸 클릭(또는 드롭) 처리. 수를 두었으면 true */
function handleSquare(sq) {
  if (!canInteract()) return false;
  const g = S.game, p = g.board[sq];
  if (S.selected >= 0 && sq !== S.selected) {
    const cands = S.targets.filter((m) => m.to === sq);
    if (cands.length) {
      const from = S.selected;
      if (cands.some((m) => m.promo)) {
        if (g.rules.promotion === 'choose') {
          askPromotion(g.turn).then((pr) => { if (pr) doMove(from, sq, pr); else renderBoard(); });
        } else doMove(from, sq, 'q');
      } else doMove(from, sq, null);
      return true;
    }
  }
  if (p && colorOf(p) === g.turn) select(sq === S.selected ? -1 : sq);
  else select(-1);
  renderBoard();
  return false;
}

function doMove(from, to, promo) {
  const g = S.game;
  if (S.mode === 'online') {
    wsSend({ type: 'move', from, to, promo });
    g.move({ from, to, promo }); // 서버 응답 전에 바로 보여주기
    select(-1);
    renderGame();
    return;
  }
  const mover = g.turn;
  const rec = g.move({ from, to, promo });
  if (!rec) return;
  settleLocalClock(mover);
  select(-1);
  renderGame();
  if (g.result) onGameOver();
  else maybeAiMove();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const m = $('#promo-modal');
    const box = $('#promo-choices');
    box.innerHTML = ['q', 'r', 'b', 'n']
      .map((t) => `<button type="button" data-p="${t}" aria-label="${t}">${pieceHtml(color === 'w' ? t.toUpperCase() : t)}</button>`)
      .join('');
    m.hidden = false;
    const done = (v) => { m.hidden = true; box.onclick = null; $('#promo-cancel').onclick = null; resolve(v); };
    box.onclick = (e) => { const b = e.target.closest('button'); if (b) done(b.dataset.p); };
    $('#promo-cancel').onclick = () => done(null);
  });
}

// 보드 포인터 입력 (클릭 + 드래그)
function setupBoardInput() {
  const board = $('#board');
  const sqFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const sqEl = el && el.closest && el.closest('#board .sq');
    return sqEl ? Number(sqEl.dataset.sq) : -1;
  };

  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const sqEl = e.target.closest('.sq');
    if (!sqEl) return;
    const sq = Number(sqEl.dataset.sq);
    const wasSelected = S.selected === sq;
    if (handleSquare(sq)) return;
    // 선택 해제 토글은 pointerup에서 처리 (드래그 시작 가능하도록 다시 선택)
    if (wasSelected) { select(sq); renderBoard(); }
    if (S.selected !== sq) return;
    const p = S.game.board[sq];
    const size = board.getBoundingClientRect().width / 8;
    const ghost = document.createElement('div');
    ghost.className = 'ghost-piece';
    ghost.innerHTML = Art.piece(p);
    ghost.style.width = ghost.style.height = size * 0.95 + 'px';
    ghost.hidden = true;
    document.body.appendChild(ghost);
    S.drag = { sq, ghost, x: e.clientX, y: e.clientY, moved: false, wasSelected, hover: -1 };
    board.setPointerCapture(e.pointerId);
  });

  board.addEventListener('pointermove', (e) => {
    const d = S.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
      d.moved = true;
      d.ghost.hidden = false;
      const el = board.querySelector(`.sq[data-sq="${d.sq}"]`);
      if (el) el.classList.add('dragging');
    }
    if (d.moved) {
      d.ghost.style.left = e.clientX + 'px';
      d.ghost.style.top = e.clientY + 'px';
      const h = sqFromPoint(e.clientX, e.clientY);
      if (h !== d.hover) {
        board.querySelector('.sq.hover')?.classList.remove('hover');
        if (h >= 0 && S.targets.some((m) => m.to === h)) board.querySelector(`.sq[data-sq="${h}"]`)?.classList.add('hover');
        d.hover = h;
      }
    }
  });

  const endDrag = (e, cancelled) => {
    const d = S.drag;
    if (!d) return;
    S.drag = null;
    d.ghost.remove();
    if (cancelled) return renderBoard();
    if (d.moved) {
      const to = sqFromPoint(e.clientX, e.clientY);
      if (to >= 0 && to !== d.sq && handleSquare(to)) return;
      renderBoard();
    } else if (d.wasSelected) {
      select(-1);
      renderBoard();
    }
  };
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));
}

// ============================================================
// 렌더링
// ============================================================
function renderGame() {
  renderBoard();
  renderBars();
  renderMoves();
  renderStatus();
  renderDrawOffer();
  renderControls();
  $('#game-rules').innerHTML = S.game ? rulesChips(S.game.rules) : '';
}

function play2DSound(rec) {
  if (!rec || !window.Sound) return;
  if (rec.captured) Sound.capture();
  else Sound.move();
  if (rec.san.endsWith('+')) Sound.check();
  if (rec.san.endsWith('#')) Sound.fanfare();
}

function renderBoard() {
  const g = S.game;
  if (!g) return;
  const threeD = S.screen === 'game' && ensure3D();
  $('#board').hidden = threeD;
  $('#board3d').hidden = !threeD;
  if (window.Board3D && window.Board3D.ok) window.Board3D.setVisible(threeD);
  const ply = g.history.length;
  if (!threeD && S.sfx.gameId === S.gameId && ply === S.sfx.ply + 1) play2DSound(g.lastMove);
  S.sfx = { gameId: S.gameId, ply };
  const flip = S.orientation === 'b';
  const last = g.lastMove;
  const checkSq = !g.result || g.result.type === 'checkmate' ? (g.inCheck() ? g.kingSquare(g.turn) : -1) : -1;
  if (threeD) {
    window.Board3D.setTheme(S.theme);
    window.Board3D.update({
      gameId: S.gameId,
      ply,
      board: g.board.slice(),
      lastMove: last,
      orientation: S.orientation,
      selected: S.selected,
      targets: S.targets.map((m) => ({ to: m.to, capture: !!m.captured })),
      checkSq,
      result: g.result,
    });
    return;
  }
  const targets = new Map(S.targets.map((m) => [m.to, m]));
  let html = '';
  for (let i = 0; i < 64; i++) {
    const sq = flip ? 63 - i : i;
    const r = sq >> 3, f = sq & 7;
    const p = g.board[sq];
    const cls = ['sq', (r + f) % 2 ? 'dark' : 'light'];
    if (last && (last.from === sq || last.to === sq)) cls.push('last');
    if (sq === S.selected) cls.push('sel');
    if (sq === checkSq) cls.push('check');
    if (targets.has(sq)) cls.push('target', targets.get(sq).captured ? 'capture' : '');
    let inner = p ? pieceHtml(p) : '';
    const row = Math.floor(i / 8), col = i % 8;
    if (row === 7) inner += `<span class="coord file">${'abcdefgh'[f]}</span>`;
    if (col === 0) inner += `<span class="coord rank">${8 - r}</span>`;
    html += `<div class="${cls.join(' ')}" data-sq="${sq}">${inner}</div>`;
  }
  $('#board').innerHTML = html;
}

function materialInfo(g) {
  const init = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  const cnt = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
  let mat = { w: 0, b: 0 };
  for (const p of g.board) {
    if (!p || p.toUpperCase() === 'K') continue;
    const c = colorOf(p), t = p.toUpperCase();
    cnt[c][t]++;
    mat[c] += VALUE[t];
  }
  // lost[c] = c가 잃은 기물
  const lost = { w: [], b: [] };
  for (const c of ['w', 'b']) {
    for (const t of ['Q', 'R', 'B', 'N', 'P']) {
      const n = Math.max(0, init[t] - cnt[c][t]);
      for (let i = 0; i < n; i++) lost[c].push(t);
    }
  }
  return { lost, mat };
}

function renderBars() {
  const g = S.game;
  const info = materialInfo(g);
  const draw = (el, c) => {
    const active = !g.result && g.turn === c;
    el.classList.toggle('active', active);
    const o = opp(c);
    const caps = info.lost[o].map((t) => Art.piece(o === 'w' ? t : t.toLowerCase())).join('');
    const diff = info.mat[c] - info.mat[o];
    const modern3D = use3D() && S.theme === 'modern';
    let tags = '';
    if (S.mode !== 'local' && c === S.myColor) tags += '<span class="tag">나</span>';
    if (modern3D) tags += `<span class="tag">${TEAM_NAME[c]}</span>`;
    const t = remaining(c);
    el.innerHTML = `
      <div class="pb-left">
        <span class="pb-avatar ${c} ${modern3D ? 't3d' : ''}" title="${COLOR_NAME[c]}">${Art.piece(c === 'w' ? 'K' : 'k')}</span>
        <div class="pb-info">
          <span class="pb-name">${esc(S.players[c] || COLOR_NAME[c])}${tags}</span>
          <span class="pb-caps">${caps}${diff > 0 ? `<span class="pb-diff">+${diff}</span>` : ''}</span>
        </div>
      </div>
      ${t == null ? '' : `<span class="clock ${t < 20000 ? 'low' : ''}" data-clock="${c}">${fmtClock(t)}</span>`}`;
  };
  draw($('#bar-top'), opp(S.orientation));
  draw($('#bar-bottom'), S.orientation);
}

function tickClocks() {
  if (S.screen !== 'game' || !S.game) return;
  for (const el of document.querySelectorAll('[data-clock]')) {
    const t = remaining(el.dataset.clock);
    el.textContent = fmtClock(t);
    el.classList.toggle('low', t < 20000);
  }
  // 로컬 게임 시간 초과 판정 (온라인은 서버가 판정)
  const g = S.game;
  if (S.mode !== 'online' && S.clocks && !g.result) {
    const c = g.turn;
    if (remaining(c) <= 0) {
      const winner = opp(c);
      endLocal(g.hasMatingMaterial(winner) ? { type: 'timeout', winner } : { type: 'timeoutDraw', winner: null });
    }
  }
}

function renderMoves() {
  const g = S.game;
  const recs = g.history.map((h) => h.rec);
  const el = $('#moves');
  if (!recs.length) {
    el.innerHTML = '<li class="moves-empty">아직 둔 수가 없습니다.</li>';
    return;
  }
  let html = '';
  for (let i = 0; i < recs.length; i += 2) {
    const a = recs[i], b = recs[i + 1];
    const cur = (k) => (k === recs.length - 1 ? ' cur' : '');
    html += `<li><span class="mv${cur(i)}">${esc(a.san)}</span>${b ? `<span class="mv${cur(i + 1)}">${esc(b.san)}</span>` : ''}</li>`;
  }
  el.innerHTML = html;
  const wrap = el.parentElement;
  wrap.scrollTop = wrap.scrollHeight;
}

function playerLabel(c) {
  if (S.mode === 'local') return COLOR_NAME[c];
  return `${S.players[c]} (${COLOR_NAME[c]})`;
}

function resultTexts(r) {
  const W = r.winner ? playerLabel(r.winner) : '';
  const L = r.winner ? playerLabel(opp(r.winner)) : '';
  switch (r.type) {
    case 'checkmate': return ['체크메이트!', `${W} 승리`];
    case 'stalemate': return ['무승부', '스테일메이트 — 둘 수 있는 수가 없습니다.'];
    case 'insufficient': return ['무승부', '체크메이트에 필요한 기물이 부족합니다.'];
    case 'fifty': return ['무승부', '50수 규칙 — 50수 동안 잡기나 폰 이동이 없었습니다.'];
    case 'threefold': return ['무승부', '같은 국면이 3번 반복되었습니다.'];
    case 'resign': return [`${W} 승리`, `${L}이(가) 기권했습니다.`];
    case 'timeout': return [`${W} 승리`, `${L}의 시간이 모두 소진되었습니다.`];
    case 'timeoutDraw': return ['무승부', '시간 초과지만 상대가 메이트할 기물이 없습니다.'];
    case 'agreement': return ['무승부', '서로 무승부에 합의했습니다.'];
    case 'abandon': return [`${W} 승리`, `${L}이(가) 게임을 나갔습니다.`];
    default: return ['게임 종료', ''];
  }
}

function renderStatus() {
  const g = S.game, el = $('#status');
  el.className = 'status';
  if (!g) return;
  if (g.result) {
    const [title, text] = resultTexts(g.result);
    el.classList.add('over');
    el.innerHTML = `${Art.icon('crown')}<span class="label">${esc(title)}${text && title !== text ? `<br><small class="muted">${esc(text)}</small>` : ''}</span>`;
    return;
  }
  const check = g.inCheck();
  let t;
  if (S.mode === 'local') t = `${COLOR_NAME[g.turn]} 차례`;
  else if (S.mode === 'ai' && S.ai.thinking) { t = '컴퓨터가 생각 중'; el.classList.add('thinking'); }
  else t = g.turn === S.myColor ? `당신의 차례 (${COLOR_NAME[g.turn]})` : `상대 차례 (${COLOR_NAME[g.turn]})`;
  if (check) { t += ' — 체크!'; el.classList.add('check'); }
  el.innerHTML = `<span class="turn-dot ${g.turn}"></span><span class="label">${esc(t)}</span>`;
}

function renderDrawOffer() {
  const el = $('#draw-offer');
  const g = S.game;
  if (S.mode !== 'online' || !S.drawOffer || !g || g.result) { el.hidden = true; return; }
  el.hidden = false;
  if (S.drawOffer === S.myColor) {
    el.innerHTML = '<span>무승부를 제안했습니다. 상대의 응답을 기다리는 중…</span>';
  } else {
    el.innerHTML = `<span>상대가 <b>무승부</b>를 제안했습니다.</span>
      <div class="btns"><button class="btn primary small" data-act="draw-accept">${Art.icon('check')}수락</button><button class="btn ghost small" data-act="draw-decline">${Art.icon('x')}거절</button></div>`;
  }
}

function renderControls() {
  const g = S.game;
  if (!g) return;
  const over = !!g.result;
  // 주요 동작: 아이콘 + 짧은 글자 (휴대폰에서는 하단 바)
  const act = (a, icon, label, o = {}) =>
    `<button type="button" class="act ${o.cls || ''}" data-act="${a}" ${o.disabled ? 'disabled' : ''}>${Art.icon(icon)}<span>${label}</span></button>`;
  let html = '';
  if (S.mode === 'ai' || S.mode === 'local') {
    const undoOk = S.opts.undo && g.history.length > 0 && !(over && ['resign', 'timeout', 'timeoutDraw'].includes(g.result.type))
      && !(S.mode === 'ai' && !g.history.some((h) => colorOf(h.rec.piece) === S.myColor));
    if (S.opts.undo) html += act('undo', 'undo', '무르기', { disabled: !undoOk });
    html += act('resign', 'flag', '기권', { disabled: over, cls: 'danger' });
    html += act('restart', 'restart', '새 게임', { cls: over ? 'primary' : '' });
    html += act('menu', 'home', '메뉴');
  } else if (S.mode === 'online') {
    const playing = S.onlineStatus === 'playing' && !over;
    if (!over) {
      html += act('draw-offer', 'scale', '무승부', { disabled: !playing || !!S.drawOffer });
      html += act('resign', 'flag', '기권', { disabled: !playing, cls: 'danger' });
    }
    if (over && S.role === 'host') html += act('rematch', 'restart', '재대결', { cls: 'primary', disabled: !(S.room && S.room.guest) });
    if (over) html += act('to-room', 'enter', '대기실');
    html += act('leave', 'leave', '나가기', { cls: 'danger' });
  }
  $('#controls').innerHTML = html;

  // 보조 기능: 보드 위 작은 아이콘 버튼
  const muted = window.Sound ? Sound.isMuted() : true;
  const tool = (a, icon, tip, on) =>
    `<button type="button" class="icon-btn ${on ? 'on' : ''}" data-act="${a}" data-tip="${tip}" aria-label="${tip}">${Art.icon(icon)}</button>`;
  let tools = tool('toggle-view', use3D() ? 'grid' : 'cube', use3D() ? '2D로 보기' : '3D로 보기');
  if (use3D()) {
    tools += tool('cycle-fx', 'film', `연출: ${FX_NAMES[S.fx]}`, S.fx !== 'off');
    tools += tool('reset-cam', 'focus', '시점 초기화');
  }
  tools += tool('flip', 'flip', '보드 뒤집기');
  tools += '<span class="sep"></span>';
  tools += tool('toggle-sound', muted ? 'mute' : 'volume', muted ? '소리 켜기' : '소리 끄기', !muted);
  $('#view-tools').innerHTML = tools;
}

// ============================================================
// 게임 종료 팝업
// ============================================================
function onGameOver() {
  renderGame();
  if (S.resultShown) return;
  S.resultShown = true;
  afterFx(showGameOver);
}

function showGameOver() {
  const g = S.game;
  if (!g || !g.result || S.screen !== 'game') return;
  const r = g.result;
  const [title, text] = resultTexts(r);
  $('#go-icon').innerHTML = r.winner ? Art.piece(r.winner === 'w' ? 'K' : 'k') : '½';
  let heading = title;
  if (r.winner && S.mode !== 'local') heading = r.winner === S.myColor ? '승리했습니다!' : '패배했습니다';
  $('#go-title').textContent = heading;
  $('#go-text').textContent = heading === title ? text : `${title !== heading ? title + ' · ' : ''}${text}`;
  const a = [];
  const b = (cls, actName, icon, label, dis) => `<button class="btn ${cls}" data-act="${actName}" ${dis ? 'disabled' : ''}>${Art.icon(icon)}${label}</button>`;
  if (S.mode === 'online') {
    if (S.role === 'host') a.push(b('primary', 'rematch', 'restart', '재대결 시작', !(S.room && S.room.guest)));
    else a.push('<span class="muted" style="width:100%">방장이 재대결을 시작할 수 있습니다.</span>');
    a.push(b('ghost', 'close-go', 'eye', '보드 보기'));
    a.push(b('ghost', 'to-room', 'enter', '대기실로'));
  } else {
    a.push(b('primary', 'restart', 'restart', '다시 하기'));
    a.push(b('ghost', 'close-go', 'eye', '보드 보기'));
    a.push(b('ghost', 'menu', 'home', '메뉴로'));
  }
  $('#go-actions').innerHTML = a.join('');
  $('#gameover').hidden = false;
}

function hideGameOver() {
  $('#gameover').hidden = true;
}

// ============================================================
// 버튼 동작
// ============================================================
async function onAction(act) {
  const g = S.game;
  switch (act) {
    case 'undo': {
      if (!g || S.mode === 'online') return;
      cancelAi();
      if (S.mode === 'ai') {
        g.undo();
        while (g.history.length && g.turn !== S.myColor) g.undo();
      } else g.undo();
      S.turnStart = Date.now();
      S.resultShown = false;
      select(-1);
      hideGameOver();
      renderGame();
      maybeAiMove();
      break;
    }
    case 'resign': {
      if (!g || g.result) return;
      if (!(await confirmBox('정말 기권하시겠습니까?'))) return;
      if (S.mode === 'online') wsSend({ type: 'resign' });
      else endLocal({ type: 'resign', winner: S.mode === 'ai' ? opp(S.myColor) : opp(g.turn) });
      break;
    }
    case 'flip':
      S.orientation = opp(S.orientation);
      renderGame();
      break;
    case 'restart':
      hideGameOver();
      startLocalGame(S.mode, g.rules, S.opts);
      break;
    case 'menu':
      if (g && !g.result && g.history.length && !(await confirmBox('진행 중인 게임을 끝내고 메뉴로 갈까요?'))) return;
      cancelAi();
      hideGameOver();
      S.game = null;
      S.mode = null;
      show('home');
      break;
    case 'close-go':
      hideGameOver();
      break;
    case 'draw-offer':
      wsSend({ type: 'offerDraw' });
      break;
    case 'draw-accept':
      wsSend({ type: 'answerDraw', accept: true });
      break;
    case 'draw-decline':
      wsSend({ type: 'answerDraw', accept: false });
      break;
    case 'rematch':
      hideGameOver();
      wsSend({ type: 'startGame' });
      break;
    case 'to-room':
      hideGameOver();
      show('room');
      renderRoom();
      break;
    case 'view-game':
      if (S.game) { show('game'); renderGame(); }
      break;
    case 'start-game':
      wsSend({ type: 'startGame' });
      break;
    case 'leave': {
      const playing = S.onlineStatus === 'playing' && S.game && !S.game.result;
      if (playing && !(await confirmBox('게임 중에 나가면 패배 처리됩니다. 나갈까요?'))) return;
      wsSend({ type: 'leaveRoom' });
      hideGameOver();
      S.room = null;
      S.game = null;
      S.mode = null;
      show('lobby');
      renderLobby();
      break;
    }
    case 'toggle-view':
      if (!use3D() && !window.Board3D) {
        toast('3D를 불러오지 못했습니다. 서버(npm start)로 실행했는지 확인해 주세요.');
        return;
      }
      S.view = use3D() ? '2d' : '3d';
      store.set('chess.view', S.view);
      renderGame();
      break;
    case 'cycle-fx': {
      const order = ['normal', 'fast', 'off'];
      S.fx = order[(order.indexOf(S.fx) + 1) % order.length];
      store.set('chess.fx', S.fx);
      if (window.Board3D) window.Board3D.setFx(S.fx);
      toast(`연출: ${FX_NAMES[S.fx]}`);
      renderControls();
      break;
    }
    case 'reset-cam':
      if (window.Board3D) window.Board3D.resetCamera();
      break;
    case 'toggle-sound':
      if (window.Sound) Sound.setMuted(!Sound.isMuted());
      toast(window.Sound && Sound.isMuted() ? '소리를 껐습니다' : '소리를 켰습니다');
      renderControls();
      break;
    case 'copy-code':
      try {
        await navigator.clipboard.writeText(S.room.id);
        toast('방 코드를 복사했습니다.');
      } catch {
        toast(`방 코드: ${S.room.id}`);
      }
      break;
  }
}

// ============================================================
// 온라인 (WebSocket)
// ============================================================
/**
 * 온라인 대전 서버 주소.
 * config.js의 onlineServer가 있으면 그 서버(예: GitHub Pages → Render), 없으면 지금 접속한 서버.
 */
function onlineServerUrl() {
  const cfg = window.CHESS_CONFIG || {};
  if (cfg.onlineServer) return String(cfg.onlineServer).replace(/\/+$/, '');
  if (cfg.staticSite || location.protocol === 'file:') return null;
  return location.origin;
}

const WAKE_LIMIT_MS = 75000; // 이 시간 안에 서버가 깨어나지 않으면 "연결할 수 없음" 안내

/** 서버 상태 확인 한 번 (잠든 서버는 응답이 늦으므로 요청마다 제한 시간) */
async function pingHealth(base, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(base + '/health', { cache: 'no-store', signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 무료 서버(Render)는 오래 쉬면 잠듦 → /health로 깨운 뒤 연결.
 * 깨우는 동안 아래쪽 안내를 경과 시간과 함께 계속 보여 줍니다.
 */
async function wakeServer(base) {
  if (base === location.origin) return;
  const t0 = Date.now();
  let ticker = 0, shown = false;
  const tick = () => {
    shown = true;
    const sec = Math.floor((Date.now() - t0) / 1000);
    toast(`온라인 서버를 깨우는 중입니다… (${sec}초) · 무료 서버라 첫 연결은 최대 1분 정도 걸려요`, 0);
  };
  // 이미 깨어 있으면 바로 연결되므로, 잠깐 기다렸다가 안내 시작
  const start = setTimeout(() => { tick(); ticker = setInterval(tick, 1000); }, 1200);
  try {
    while (Date.now() - t0 < WAKE_LIMIT_MS) {
      if (await pingHealth(base, Math.max(1000, WAKE_LIMIT_MS - (Date.now() - t0)))) return;
      await new Promise((r) => setTimeout(r, 2500));
    }
    const err = new Error('server wake timeout');
    err.wakeFailed = true;
    throw err;
  } finally {
    clearTimeout(start);
    clearInterval(ticker);
    if (shown) hideToast();
  }
}

/** 온라인 연결. 서버가 끝내 깨어나지 않으면 "다시 시도 / 홈으로"를 묻습니다. */
async function ensureOnline() {
  for (;;) {
    try {
      await connect();
      return true;
    } catch (e) {
      if (!e || !e.wakeFailed) return false;
      const retry = await confirmBox('온라인 서버에 연결할 수 없습니다. 서버가 깨어나는 데 시간이 더 걸리고 있어요. 다시 시도할까요?',
        { yes: '다시 시도', no: '홈으로', yesClass: 'primary' });
      if (!retry) {
        if (S.screen !== 'home') show('home');
        return false;
      }
    }
  }
}

function connect() {
  if (S.ws && S.ws.readyState === 1) return Promise.resolve();
  if (S.wsPromise) return S.wsPromise;
  const base = onlineServerUrl();
  if (!base) {
    toast(location.protocol === 'file:'
      ? '온라인 대전은 서버를 실행한 뒤 http://localhost:3100 으로 접속해야 합니다.'
      : '이 사이트에는 아직 온라인 대전 서버가 연결되어 있지 않습니다.');
    return Promise.reject(new Error('no online server'));
  }
  S.wsPromise = wakeServer(base).then(() => new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws'));
    S.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      ws.send(JSON.stringify({ type: 'hello', name: S.name || '플레이어' }));
      resolve();
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      onWsMessage(msg);
    };
    ws.onclose = () => {
      const current = S.ws === ws;
      if (current) S.ws = null;
      if (!opened) {
        toast('서버에 연결할 수 없습니다.');
        reject(new Error('connect failed'));
      } else if (current) onDisconnected();
    };
  })).finally(() => { S.wsPromise = null; });
  return S.wsPromise;
}

function disconnect() {
  const ws = S.ws;
  S.ws = null;
  if (ws) ws.close();
}

function wsSend(msg) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msg));
  else toast('서버와 연결되어 있지 않습니다.');
}

function onDisconnected() {
  if (S.mode === 'online' || ['lobby', 'room'].includes(S.screen)) {
    toast('서버와 연결이 끊어졌습니다.');
    hideGameOver();
    S.room = null;
    if (S.mode === 'online') { S.mode = null; S.game = null; }
    show('home');
  }
}

function onWsMessage(m) {
  switch (m.type) {
    case 'rooms':
      S.rooms = m.rooms;
      if (S.screen === 'lobby') renderLobby();
      break;
    case 'room':
      onRoomMsg(m);
      break;
    case 'game':
      onGameMsg(m);
      break;
    case 'roomClosed':
      toast(m.message);
      hideGameOver();
      S.room = null;
      S.game = null;
      S.mode = null;
      show('lobby');
      renderLobby();
      break;
    case 'error':
      toast(m.message);
      break;
  }
}

function onRoomMsg(m) {
  const prev = S.room;
  S.room = m.room;
  S.role = m.role;
  // 새로 들어간 방: 방장은 방 만들 때 고른 모드, 참가자는 고전 전투로 시작 (대기실에서 변경)
  if (S.themeRoom !== m.room.id) {
    if (m.role === 'guest') S.theme = 'classic';
    S.themeRoom = m.room.id;
  }
  if (prev && prev.id === m.room.id && S.role === 'host') {
    if (prev.guest && !m.room.guest) toast(`${prev.guest}님이 방을 나갔습니다.`);
    if (!prev.guest && m.room.guest) toast(`${m.room.guest}님이 들어왔습니다!`);
  }
  if (m.room.status === 'playing') {
    // 게임 정보는 'game' 메시지로 이어서 도착
  } else if (S.screen === 'game' && S.mode === 'online' && S.game && S.game.result) {
    renderControls(); // 결과 화면 유지
  } else {
    show('room');
  }
  renderRoom();
  renderWho();
}

function onGameMsg(m) {
  const isNew = m.gameNo !== S.gameNo || S.mode !== 'online';
  if (isNew) {
    S.gameNo = m.gameNo;
    S.gameId++;
    S.resultShown = false;
    select(-1);
    hideGameOver();
    S.orientation = m.yourColor;
  }
  S.mode = 'online';
  S.opts = {};
  S.myColor = m.yourColor;
  S.players = m.players;
  S.drawOffer = m.drawOffer;
  S.onlineStatus = m.status;
  const g = Chess.fromMoves(m.rules, m.moves);
  if (m.result) g.result = m.result;
  S.game = g;
  S.clockSnap = m.clocks ? Object.assign({}, m.clocks, { at: Date.now() }) : null;
  if (S.selected >= 0) {
    const p = g.board[S.selected];
    if (!p || colorOf(p) !== g.turn || g.turn !== S.myColor || g.result) select(-1);
    else select(S.selected);
  }
  if (m.status === 'playing' || isNew) show('game');
  if (S.screen === 'game') renderGame();
  if (g.result && !S.resultShown) {
    S.resultShown = true;
    afterFx(showGameOver);
  }
}

// ---------- 로비 ----------
function renderLobby() {
  const el = $('#room-list');
  if (!S.rooms.length) {
    el.innerHTML = '<div class="empty">열린 방이 없습니다.<br>새 방을 만들어 친구를 초대해 보세요!</div>';
    return;
  }
  const statusName = { waiting: '대기 중', playing: '게임 중', ended: '게임 종료' };
  el.innerHTML = S.rooms
    .map((r, i) => {
      const full = !!r.guest;
      const r2 = r.rules;
      const time = r2.time ? `${r2.time}분${r2.increment ? `+${r2.increment}초` : ''}` : '무제한';
      return `<div class="room-item" style="animation-delay:${i * 40}ms">
        <div class="info">
          <div class="name">${esc(r.name)}<span class="badge ${full ? 'playing' : 'waiting'}">${full ? (statusName[r.status] || '가득 참') : '참가 가능'}</span></div>
          <div class="meta"><span class="room-code-tag">${esc(r.id)}</span><span>방장 ${esc(r.host)}</span><span>${full ? '2/2' : '1/2'}명</span><span>${Art.icon('clock')} ${time}</span></div>
        </div>
        <button class="btn ${full ? 'ghost' : 'primary'} small" data-join="${esc(r.id)}" ${full ? 'disabled' : ''}>${Art.icon('enter')}참가</button>
      </div>`;
    })
    .join('');
}

async function openLobby() {
  if (!(await ensureOnline())) return;
  show('lobby');
  renderLobby();
  wsSend({ type: 'listRooms' });
}

async function joinRoom(id) {
  id = String(id || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(id)) return toast('4자리 방 코드를 입력하세요.');
  if (!(await ensureOnline())) return;
  wsSend({ type: 'joinRoom', id });
}

// ---------- 대기실 ----------
function renderRoom() {
  const r = S.room;
  if (!r) return;
  const isHost = S.role === 'host';
  const colorTxt = { w: '방장이 백 (선공)', b: '방장이 흑 (후공)', random: '색은 무작위로 정해짐' }[r.hostColor];
  const slot = (role, name, mine) => `
    <div class="slot ${name ? '' : 'empty-slot'}">
      <div class="role">${role}${mine ? ' · 나' : ''}</div>
      <div class="pname">${name ? esc(name) : '참가자를 기다리는 중…'}</div>
    </div>`;
  const canViewLast = S.mode === 'online' && S.game && S.game.result;
  const viewLast = canViewLast ? `<button class="btn ghost" data-act="view-game">${Art.icon('eye')}지난 게임 보기</button>` : '';
  let foot;
  if (isHost) {
    foot = `${r.guest ? '' : '<p class="wait-note">방 코드를 친구에게 알려주세요. 상대가 들어오면 시작할 수 있습니다.</p>'}
    <div class="actions">
      <button class="btn danger" data-act="leave">${Art.icon('leave')}방 나가기</button>
      ${viewLast}
      <button class="btn primary big-cta" data-act="start-game" ${r.guest ? '' : 'disabled'}>${Art.icon('play')}게임 시작</button>
    </div>`;
  } else {
    foot = `<p class="wait-note">방장이 게임을 시작하기를 기다리는 중…</p>
    <div class="actions">
      ${viewLast}
      <button class="btn danger" data-act="leave">${Art.icon('leave')}방 나가기</button>
    </div>`;
  }
  $('#room-card').innerHTML = `
    <div class="card-head">
      <h2>${esc(r.name)}</h2>
      <span class="room-code"><span>방 코드</span><b>${esc(r.id)}</b><button class="icon-btn" data-act="copy-code" data-tip="코드 복사" aria-label="코드 복사">${Art.icon('copy')}</button></span>
    </div>
    <div class="vs">
      ${slot('방장', r.host, isHost)}
      <div class="vs-mark">VS</div>
      ${slot('참가자', r.guest, !isHost)}
    </div>
    <p class="muted" style="margin:0 0 10px">${colorTxt}</p>
    <div class="rules-summary">${rulesChips(r.rules)}</div>
    <div class="form-grid room-theme">
      ${themePickHtml({ key: 'room-theme', label: '내 화면 전투 모드', desc: '각자 원하는 모드로 봅니다', options: THEME_OPTIONS }, S.theme)}
    </div>
    ${foot}`;
}

// ============================================================
// 초기화
// ============================================================
function saveName() {
  const v = $('#nickname').value.trim().slice(0, 12);
  S.name = v;
  store.set('chess.name', v);
  renderWho();
}

function init() {
  $('#nickname').value = S.name;
  $('#nickname').addEventListener('input', saveName);

  for (const b of document.querySelectorAll('[data-go]')) {
    b.addEventListener('click', () => {
      saveName();
      if (!S.name) {
        S.name = '플레이어' + Math.floor(Math.random() * 900 + 100);
        $('#nickname').value = S.name;
        store.set('chess.name', S.name);
      }
      const go = b.dataset.go;
      if (go === 'online') openLobby();
      else openSetup(go);
    });
  }

  $('#logo').addEventListener('click', () => {
    if (S.screen === 'home') return;
    if (S.mode === 'online' || ['lobby', 'room'].includes(S.screen)) return toast('온라인 대전 중에는 "방 나가기" / "뒤로"를 사용하세요.');
    onAction('menu');
  });

  $('#setup-back').addEventListener('click', () => {
    if (S.setupMode === 'online') { show('lobby'); renderLobby(); }
    else show('home');
  });
  $('#setup-go').addEventListener('click', submitSetup);

  $('#lobby-back').addEventListener('click', () => { disconnect(); show('home'); });
  $('#lobby-refresh').addEventListener('click', () => wsSend({ type: 'listRooms' }));
  $('#lobby-create').addEventListener('click', () => openSetup('online'));
  $('#join-go').addEventListener('click', () => joinRoom($('#join-code').value));
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(e.target.value); });
  $('#room-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-join]');
    if (b) joinRoom(b.dataset.join);
  });
  // 전투 모드 카드 선택: 그 자리에서 화면 분위기 미리보기
  const pickTheme = (container, e) => {
    if (e.target.type !== 'radio') return null;
    for (const c of container.querySelectorAll('.theme-card')) c.classList.toggle('sel', c.contains(e.target));
    const v = e.target.value === 'modern' ? 'modern' : 'classic';
    setUi(v);
    return v;
  };
  $('#room-card').addEventListener('change', (e) => {
    const v = pickTheme($('#room-card'), e);
    if (v) S.theme = v;
  });
  $('#setup-mode').addEventListener('change', (e) => {
    const v = pickTheme($('#setup-mode'), e);
    if (v) S.setupTheme = v;
  });

  // 아이콘 채우기
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = Art.icon(el.dataset.icon);
  $('#logo-mark').innerHTML = Art.piece('N');
  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (S.screen === 'home') updateHomeBg(); }, 250);
  });

  // data-act 버튼 (게임 컨트롤, 팝업, 대기실 등)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) onAction(b.dataset.act);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#gameover').hidden) hideGameOver();
      else if (S.selected >= 0) { select(-1); renderBoard(); }
    }
  });

  setupBoardInput();
  setInterval(tickClocks, 100);
  show('home');

  // 온라인 서버가 다른 곳(Render)에 있으면 접속하자마자 미리 깨워 둠 (화면 표시 없음)
  const online = onlineServerUrl();
  if (online && online !== location.origin) pingHealth(online, 70000);
}

init();
