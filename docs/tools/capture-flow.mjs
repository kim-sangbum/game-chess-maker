/*
 * 문서용 실제 게임 화면 캡처 흐름 (게임 소스와 분리된 도구)
 *
 * - 설치된 Chrome/Edge를 headless로 실행하고 Chrome DevTools Protocol(CDP)로 조작합니다.
 *   (Node 내장 WebSocket 사용 → 추가 설치 없음)
 * - 클릭은 실제 마우스 이벤트(Input.dispatchMouseEvent)로 보냅니다. 게임 상태를 직접 바꾸지 않습니다.
 * - 3D 보드의 칸 위치는 페이지의 카메라로 화면 좌표를 계산(읽기만)한 뒤 그 위치를 클릭합니다.
 *
 * 사용법 (게임 서버 실행 후, 프로젝트 루트에서):
 *   node docs/tools/capture-flow.mjs [URL] [출력 폴더]
 *   기본값: http://localhost:3100  docs/screenshots
 *   브라우저 경로는 CHROME_PATH 환경 변수로 지정할 수 있습니다.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:3100';
const OUT = process.argv[3] || 'docs/screenshots';
const W = 1440, H = 900, PORT = 9333;
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) { console.error('Chrome/Edge를 찾을 수 없습니다. CHROME_PATH를 지정하세요.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'chess-capture-'));
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });

// ---------- CDP ----------
let ws, seq = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
        };
        return;
      }
    } catch { /* 아직 준비 안 됨 */ }
    await sleep(200);
  }
  throw new Error('Chrome 디버깅 포트에 연결하지 못했습니다');
}
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function js(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expr, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await js(expr)) return; await sleep(100); }
  throw new Error('시간 초과: ' + expr);
}
async function clickAt(x, y) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'mouse' });
  }
}
async function click(selector) {
  const r = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r) throw new Error('요소 없음: ' + selector);
  await clickAt(r.x, r.y);
}
/** 3D 보드의 칸('e2')을 화면 좌표로 바꿔 실제로 클릭 */
async function clickSquare(name) {
  const f = 'abcdefgh'.indexOf(name[0]), row = 8 - Number(name[1]);
  const pt = await js(`(() => { const B = window.Board3D; const V = B.camera.position.constructor;
    const p = new V(${f - 3.5}, 0.05, ${row - 3.5}).project(B.camera); const b = B.renderer.domElement.getBoundingClientRect();
    return { x: b.left + (p.x + 1) / 2 * b.width, y: b.top + (1 - p.y) / 2 * b.height }; })()`);
  await clickAt(pt.x, pt.y);
}
const idle = () => js('window.Board3D.whenIdle().then(() => true)', true);
async function move(from, to) { await clickSquare(from); await sleep(250); await clickSquare(to); await sleep(300); await idle(); await sleep(250); }
async function shot(name, caption) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  log(`캡처: ${name} — ${caption}`);
}

// ---------- 흐름 ----------
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ });
  await waitFor('document.readyState === "complete" && !!window.Board3D');
  await waitFor('document.fonts.status === "loaded"');

  // 1) 홈 화면 (3D 회전 배경)
  await click('#nickname');
  await send('Input.insertText', { text: '플레이어' });
  await waitFor('document.body.classList.contains("has-home-3d")');
  await sleep(2500);
  await shot('01-main-menu.png', '홈 화면');

  // 2) 게임 설정 화면 (한 화면 2인 대전)
  await click('[data-go="local"]');
  await waitFor('!document.querySelector("#screen-setup").hidden');
  await sleep(600);
  await shot('02-setup.png', '설정 화면 (전투 모드 · 규칙)');

  // 3) 고전 전투 게임 화면
  await click('#setup-go');
  await waitFor('!document.querySelector("#screen-game").hidden && window.Board3D.ok && window.Board3D.visible');
  await sleep(1500);
  await move('e2', 'e4');
  await move('d7', 'd5');
  await clickSquare('e4'); // 선택: 이동 가능한 칸 표시
  await sleep(500);
  await shot('03-gameplay-classic.png', '고전 전투 — 폰 선택, 잡을 수 있는 칸 표시');

  // 4) 공격 연출 (창병이 상대 창병을 찌르는 순간)
  await clickSquare('d5');
  await sleep(1150);
  await shot('04-attack.png', '공격 연출 — 창 찌르기');
  await idle();
  await sleep(500);

  // 5) 결과 화면 (새 게임 → 바보의 메이트)
  await click('[data-act="restart"]');
  await sleep(1200);
  await move('f2', 'f3');
  await move('e7', 'e5');
  await move('g2', 'g4');
  await move('d8', 'h4');
  await waitFor('!document.querySelector("#gameover").hidden', 20000);
  await sleep(900);
  await shot('05-result.png', '체크메이트 결과 화면');

  // 6) 현대전
  await click('#go-actions [data-act="menu"]');
  await waitFor('!document.querySelector("#screen-home").hidden');
  await sleep(500);
  await click('[data-go="local"]');
  await sleep(500);
  await click('.theme-card input[value="modern"]');
  await sleep(400);
  await click('#setup-go');
  await waitFor('window.Board3D.visible && document.body.dataset.ui === "modern"');
  await sleep(1500);
  await move('e2', 'e4');
  await move('e7', 'e5');
  await move('g1', 'f3');
  await move('b8', 'c6');
  await clickSquare('f1');
  await sleep(500);
  await shot('06-modern.png', '현대전 — 초록군 vs 갈색군');
  log('완료');
} catch (e) {
  console.error('캡처 실패:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* 무시 */ }
  proc.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 무시 */ }
}
