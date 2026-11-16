'use strict';
/*
 * 체스 게임 서버
 *  - public/ 폴더의 정적 파일 제공
 *  - WebSocket으로 방 만들기 / 참가 / 온라인 대국 진행 (서버가 모든 수를 검증)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Chess = require('./public/chess.js');

const PORT = Number(process.env.PORT) || 3100;
const PUBLIC = path.join(__dirname, 'public');
const NM = path.join(__dirname, 'node_modules');
const VENDOR = [
  ['/vendor/three/', path.join(NM, 'three')],
  ['/vendor/fontsource/', path.join(NM, '@fontsource')],
  ['/vendor/pretendard/', path.join(NM, 'pretendard', 'dist', 'web')],
  ['/docs/', path.join(__dirname, 'docs')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

// ---------- 정적 파일 ----------
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  // 상태 확인 (GitHub Pages의 게임이 잠든 서버를 깨울 때 사용 → 다른 출처에서도 호출 가능)
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }
  // 소개 페이지: /docs → /docs/ (페이지 안의 상대 경로가 맞도록)
  if (pathname === '/docs') {
    res.writeHead(301, { Location: '/docs/' });
    return res.end();
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  // /vendor/... → node_modules의 라이브러리 (3D, 글꼴), /docs/... → 소개 페이지
  let root = PUBLIC, rel = pathname;
  for (const [prefix, dir] of VENDOR) {
    if (pathname.startsWith(prefix)) {
      root = dir;
      rel = pathname.slice(prefix.length - 1);
      break;
    }
  }
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- 방 / 대국 ----------
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const clients = new Set();
const rooms = new Map();
let nextClientId = 1;

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const cleanText = (s, max, fallback) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || fallback;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
  } while (rooms.has(c));
  return c;
}

function roomInfo(room) {
  return {
    id: room.id,
    name: room.name,
    host: room.host.name,
    guest: room.guest ? room.guest.name : null,
    rules: room.rules,
    hostColor: room.hostColor,
    status: room.status,
  };
}

function roomList() {
  return [...rooms.values()].map(roomInfo);
}

function broadcastLobby() {
  const list = roomList();
  for (const ws of clients) if (!ws.roomId) send(ws, { type: 'rooms', rooms: list });
}

const members = (room) => [room.host, room.guest].filter(Boolean);

function sendRoom(room) {
  for (const p of members(room)) send(p, { type: 'room', room: roomInfo(room), role: p === room.host ? 'host' : 'guest' });
}

function colorOfPlayer(room, ws) {
  if (!room.colors) return null;
  if (room.colors.w === ws) return 'w';
  if (room.colors.b === ws) return 'b';
  return null;
}

function currentClocks(room) {
  if (!room.clocks) return null;
  const c = { w: room.clocks.w, b: room.clocks.b };
  const running = room.status === 'playing';
  if (running) c[room.game.turn] -= Date.now() - room.turnStart;
  return { w: Math.max(0, c.w), b: Math.max(0, c.b), turn: room.game.turn, running };
}

function sendGame(room) {
  if (!room.game) return;
  const base = {
    type: 'game',
    gameNo: room.gameNo,
    rules: room.rules,
    moves: room.game.moves,
    players: { w: room.colors.w.name, b: room.colors.b.name },
    clocks: currentClocks(room),
    result: room.game.result,
    drawOffer: room.drawOffer,
    status: room.status,
  };
  for (const p of members(room)) {
    const yourColor = colorOfPlayer(room, p);
    if (yourColor) send(p, Object.assign({}, base, { yourColor }));
  }
}

/** 현재 차례 시계에서 경과 시간을 차감 */
function settleClock(room) {
  if (!room.clocks || room.status !== 'playing') return;
  const now = Date.now();
  room.clocks[room.game.turn] -= now - room.turnStart;
  room.turnStart = now;
}

function finishGame(room, result) {
  settleClock(room);
  if (result) room.game.result = result;
  room.status = 'ended';
  room.drawOffer = null;
  sendGame(room);
  sendRoom(room);
  broadcastLobby();
}

function startGame(room) {
  const hc = room.hostColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : room.hostColor;
  room.colors = hc === 'w' ? { w: room.host, b: room.guest } : { w: room.guest, b: room.host };
  room.game = new Chess(room.rules);
  room.gameNo++;
  room.clocks = room.rules.time > 0 ? { w: room.rules.time * 60000, b: room.rules.time * 60000 } : null;
  room.turnStart = Date.now();
  room.status = 'playing';
  room.drawOffer = null;
  sendRoom(room);
  sendGame(room);
  broadcastLobby();
}

function leaveRoom(ws) {
  const room = rooms.get(ws.roomId);
  ws.roomId = null;
  if (!room) return;
  if (room.status === 'playing' && colorOfPlayer(room, ws)) {
    const c = colorOfPlayer(room, ws);
    settleClock(room);
    room.game.result = { type: 'abandon', winner: Chess.opp(c) };
    room.status = 'ended';
    room.drawOffer = null;
  }
  if (room.host === ws) {
    rooms.delete(room.id);
    if (room.guest) {
      const g = room.guest;
      room.guest = null;
      g.roomId = null;
      send(g, { type: 'roomClosed', message: '방장이 방을 나가서 방이 닫혔습니다.' });
      send(g, { type: 'rooms', rooms: roomList() });
    }
  } else if (room.guest === ws) {
    room.guest = null;
    sendGame(room);
    sendRoom(room);
  }
  broadcastLobby();
}

function handle(ws, msg) {
  const room = rooms.get(ws.roomId);
  switch (msg.type) {
    case 'hello':
      ws.name = cleanText(msg.name, 12, '플레이어');
      send(ws, { type: 'rooms', rooms: roomList() });
      break;

    case 'listRooms':
      send(ws, { type: 'rooms', rooms: roomList() });
      break;

    case 'createRoom': {
      if (room) leaveRoom(ws);
      const id = makeCode();
      const r = {
        id,
        name: cleanText(msg.name, 24, `${ws.name}의 방`),
        host: ws,
        guest: null,
        rules: Chess.normalizeRules(msg.rules),
        hostColor: ['w', 'b', 'random'].includes(msg.hostColor) ? msg.hostColor : 'random',
        status: 'waiting',
        game: null,
        gameNo: 0,
        colors: null,
        clocks: null,
        turnStart: 0,
        drawOffer: null,
      };
      rooms.set(id, r);
      ws.roomId = id;
      sendRoom(r);
      broadcastLobby();
      break;
    }

    case 'joinRoom': {
      const id = String(msg.id || '').toUpperCase().trim();
      const target = rooms.get(id);
      if (!target) return send(ws, { type: 'error', message: '방을 찾을 수 없습니다.' });
      if (ws.roomId === id) return sendRoom(target);
      if (target.guest) return send(ws, { type: 'error', message: '이미 가득 찬 방입니다.' });
      if (room) leaveRoom(ws);
      target.guest = ws;
      ws.roomId = id;
      if (target.status !== 'playing') target.status = 'waiting';
      sendRoom(target);
      broadcastLobby();
      break;
    }

    case 'leaveRoom':
      leaveRoom(ws);
      send(ws, { type: 'rooms', rooms: roomList() });
      break;

    case 'startGame':
      if (!room) return;
      if (room.host !== ws) return send(ws, { type: 'error', message: '방장만 게임을 시작할 수 있습니다.' });
      if (!room.guest) return send(ws, { type: 'error', message: '상대가 아직 들어오지 않았습니다.' });
      if (room.status === 'playing') return;
      startGame(room);
      break;

    case 'move': {
      if (!room || room.status !== 'playing') return;
      const c = colorOfPlayer(room, ws);
      if (c !== room.game.turn) return send(ws, { type: 'error', message: '지금은 당신의 차례가 아닙니다.' });
      settleClock(room);
      if (room.clocks && room.clocks[c] <= 0) return checkTimeout(room, true);
      const rec = room.game.move({ from: msg.from, to: msg.to, promo: msg.promo });
      if (!rec) {
        send(ws, { type: 'error', message: '둘 수 없는 수입니다.' });
        return sendGame(room);
      }
      if (room.clocks) room.clocks[c] += room.rules.increment * 1000;
      room.turnStart = Date.now();
      room.drawOffer = null;
      if (room.game.result) finishGame(room);
      else sendGame(room);
      break;
    }

    case 'resign': {
      if (!room || room.status !== 'playing') return;
      const c = colorOfPlayer(room, ws);
      if (c) finishGame(room, { type: 'resign', winner: Chess.opp(c) });
      break;
    }

    case 'offerDraw': {
      if (!room || room.status !== 'playing') return;
      const c = colorOfPlayer(room, ws);
      if (!c || room.drawOffer) return;
      room.drawOffer = c;
      sendGame(room);
      break;
    }

    case 'answerDraw': {
      if (!room || room.status !== 'playing') return;
      const c = colorOfPlayer(room, ws);
      if (!c || !room.drawOffer || room.drawOffer === c) return;
      if (msg.accept) finishGame(room, { type: 'agreement', winner: null });
      else {
        room.drawOffer = null;
        sendGame(room);
      }
      break;
    }
  }
}

function checkTimeout(room, force) {
  if (!room.clocks || room.status !== 'playing') return;
  const turn = room.game.turn;
  const left = room.clocks[turn] - (Date.now() - room.turnStart);
  if (left > 0 && !force) return;
  settleClock(room);
  room.clocks[turn] = 0;
  const winner = Chess.opp(turn);
  finishGame(room, room.game.hasMatingMaterial(winner) ? { type: 'timeout', winner } : { type: 'timeoutDraw', winner: null });
}

setInterval(() => {
  for (const room of rooms.values()) checkTimeout(room, false);
}, 200);

wss.on('connection', (ws) => {
  ws.id = nextClientId++;
  ws.name = '플레이어';
  ws.roomId = null;
  clients.add(ws);
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    try {
      handle(ws, msg);
    } catch (e) {
      console.error(e);
      send(ws, { type: 'error', message: '서버 오류가 발생했습니다.' });
    }
  });
  ws.on('close', () => {
    leaveRoom(ws);
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`\n♞ 체스 서버 실행 중`);
  console.log(`  이 컴퓨터:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  같은 네트워크: http://${a.address}:${PORT}`);
    }
  }
  console.log('');
});
