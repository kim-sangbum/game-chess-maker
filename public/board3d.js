/*
 * 3D 체스판 + 장난감 병사 기물 + 공격 연출 (Three.js)
 * app.js에서 window.Board3D.update(state)로 상태를 넘겨주면,
 * 한 수씩 늘어날 때는 애니메이션으로, 그 외에는 즉시 다시 배치합니다.
 *
 * 좌표: 칸 하나 = 1, 파일 a~h → x = -3.5 ~ 3.5, 보드 인덱스 행(0=8랭크) → z = -3.5 ~ 3.5
 * 백(초록군)은 z+ 쪽에서 z- 방향을 바라봅니다.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PALETTE = {
  modern: {
    w: { main: 0x4f7d32, dark: 0x3b5f25, light: 0x67964a },  // 초록군 (백)
    b: { main: 0xa8794a, dark: 0x7f5834, light: 0xc09264 },  // 갈색군 (흑)
  },
  classic: {
    w: { main: 0xf1ede3, dark: 0xcdc5b3, light: 0xf8f2e6 },  // 흰색 (칠한 장난감)
    b: { main: 0x2a2a2f, dark: 0x17171a, light: 0x44444b },  // 검은색
  },
};
const GOLD = 0xd9ae3e, SILVER = 0xcfd3d8, FLAG = 0xf6f4ec;
const SPEED = { normal: 1, fast: 2.6, off: 1 };
const TAU = Math.PI * 2;

class Cancel extends Error {}
const snd = (name, ...args) => { try { window.Sound?.[name]?.(...args); } catch { /* 무시 */ } };
const lerp = (a, b, t) => a + (b - a) * t;
const linear = (t) => t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;
const backOut = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const sqPos = (sq) => new THREE.Vector3((sq & 7) - 3.5, 0, (sq >> 3) - 3.5);
const homeAngle = (c) => (c === 'w' ? Math.PI : 0);
const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const styleOf = (type) => (type === 'R' ? 'tank' : type === 'N' ? 'gallop' : 'march');

// ---------- 지오메트리 캐시 ----------
const GEO = {};
const geo = (key, make) => GEO[key] || (GEO[key] = make());
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 16) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const sph = (r, s = 16) => geo(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, Math.round(s * 0.75))));
const hemi = (r) => geo(`h${r}`, () => new THREE.SphereGeometry(r, 18, 9, 0, TAU, 0, Math.PI / 2));

function mesh(g, mat, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

function makeMats(color, theme) {
  const t = PALETTE[theme][color];
  const gloss = theme === 'classic' ? 0.32 : 0.45; // 칠한 장난감은 조금 더 광택
  const mk = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: gloss, metalness: 0.04 }, extra));
  return {
    main: mk(t.main), dark: mk(t.dark), light: mk(t.light),
    wood: mk(0x7a5230, { roughness: 0.7 }),
    gold: mk(GOLD, { metalness: 0.6, roughness: 0.3 }),
    silver: mk(SILVER, { metalness: 0.75, roughness: 0.25 }),
    flag: mk(FLAG, { side: THREE.DoubleSide, roughness: 0.8 }),
  };
}

// ---------- 모델 ----------
function addBase(group, m, r = 0.31) {
  mesh(cyl(r, r + 0.02, 0.06, 28), m.main, 0, 0.03, 0, group);
}

/** 장난감 병사 한 명. 원점 = 발 밑, 정면 = +z */
function buildSoldier(m, { headgear = 'helmet', scale = 1 } = {}) {
  const root = new THREE.Group();
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.05 * sx, 0.27, 0);
    mesh(box(0.075, 0.27, 0.09), m.main, 0, -0.135, 0, hip);
    mesh(box(0.08, 0.05, 0.12), m.dark, 0, -0.245, 0.015, hip);
    root.add(hip);
    legs.push(hip);
  }
  mesh(box(0.21, 0.25, 0.13), m.main, 0, 0.395, 0, root);      // 몸통
  mesh(box(0.215, 0.04, 0.135), m.dark, 0, 0.29, 0, root);      // 벨트
  mesh(box(0.06, 0.07, 0.03), m.dark, 0.05, 0.42, 0.07, root);  // 주머니
  mesh(cyl(0.04, 0.045, 0.04, 10), m.main, 0, 0.535, 0, root);  // 목
  const head = mesh(sph(0.078), m.light, 0, 0.6, 0, root);
  if (headgear === 'helmet') {
    mesh(hemi(0.092), m.dark, 0, 0.615, 0, root);
    mesh(cyl(0.11, 0.11, 0.012, 20), m.dark, 0, 0.615, 0, root);
  } else if (headgear === 'beret') {
    const b = mesh(cyl(0.085, 0.092, 0.04, 16), m.dark, -0.015, 0.67, 0, root);
    b.rotation.z = 0.28;
  } else if (headgear === 'cap' || headgear === 'general') {
    mesh(cyl(0.1, 0.082, 0.065, 18), m.dark, 0, 0.678, 0, root);
    mesh(box(0.13, 0.012, 0.07), m.dark, 0, 0.646, 0.075, root);
    mesh(box(0.15, 0.018, 0.012), m.gold, 0, 0.66, 0.084, root);
  }
  const arms = {};
  for (const [side, sx] of [['r', -1], ['l', 1]]) {
    const sh = new THREE.Group();
    sh.position.set(0.135 * sx, 0.5, 0);
    mesh(box(0.06, 0.23, 0.07), m.main, 0, -0.105, 0, sh);
    mesh(sph(0.035, 10), m.light, 0, -0.235, 0, sh);
    root.add(sh);
    arms[side] = sh;
  }
  root.scale.setScalar(scale);
  return { root, legs, arms, head };
}

/** 손에 드는 총. 팔 방향(-y)을 따라 뻗음 */
function gun(m, L, { scope = false } = {}) {
  const g = new THREE.Group();
  g.position.y = -0.22;
  mesh(box(0.032, L, 0.04), m.dark, 0, -L / 2 + 0.1, 0.035, g);
  mesh(box(0.042, 0.1, 0.06), m.dark, 0, 0.07, 0.03, g);
  let scopeObj = null;
  if (scope) scopeObj = mesh(cyl(0.02, 0.02, 0.13, 10), m.dark, 0, -L * 0.25, 0.075, g);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -L + 0.1, 0.035);
  g.add(muzzle);
  return { group: g, muzzle, scope: scopeObj };
}

function buildPawn(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.28);
  const s = buildSoldier(m, { headgear: 'helmet', scale: 1 });
  s.root.position.y = 0.06;
  group.add(s.root);
  const g = gun(m, 0.36);
  s.arms.r.add(g.group);
  s.arms.r.rotation.x = -0.5;
  s.arms.l.rotation.x = -0.35;
  mesh(box(0.15, 0.17, 0.07), m.dark, 0, 0.4, -0.1, s.root); // 배낭
  return { group, soldier: s, gunArm: s.arms.r, muzzle: g.muzzle };
}

function buildBishop(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.3);
  const s = buildSoldier(m, { headgear: 'beret', scale: 1.1 });
  s.root.position.y = 0.06;
  group.add(s.root);
  const g = gun(m, 0.5, { scope: true });
  s.arms.r.add(g.group);
  s.arms.r.rotation.x = -0.4;
  s.arms.l.rotation.x = -0.25;
  // 탄띠
  const belt = mesh(box(0.03, 0.32, 0.14), m.dark, 0, 0.4, 0, s.root);
  belt.rotation.z = 0.7;
  return { group, soldier: s, gunArm: s.arms.r, muzzle: g.muzzle, scope: g.scope };
}

function buildQueen(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.31);
  const s = buildSoldier(m, { headgear: 'cap', scale: 1.2 });
  s.root.position.y = 0.06;
  group.add(s.root);
  for (const sx of [-1, 1]) mesh(box(0.08, 0.025, 0.1), m.gold, 0.12 * sx, 0.525, 0, s.root); // 견장
  const sash = mesh(box(0.025, 0.3, 0.14), m.gold, 0, 0.4, 0, s.root);
  sash.rotation.z = -0.65;
  const g = gun(m, 0.15);
  s.arms.r.add(g.group);
  s.arms.r.rotation.x = -0.15;
  return { group, soldier: s, gunArm: s.arms.r, muzzle: g.muzzle };
}

function buildKing(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.33);
  const s = buildSoldier(m, { headgear: 'general', scale: 1.32 });
  s.root.position.y = 0.06;
  group.add(s.root);
  // 모자 별
  const star = mesh(geo('star', () => new THREE.OctahedronGeometry(0.03)), m.gold, 0, 0.69, 0.085, s.root);
  star.scale.set(1, 1, 0.4);
  // 망토
  mesh(box(0.26, 0.38, 0.02), m.dark, 0, 0.34, -0.08, s.root);
  for (const sx of [-1, 1]) mesh(box(0.085, 0.028, 0.1), m.gold, 0.12 * sx, 0.525, 0, s.root);
  for (let i = 0; i < 3; i++) mesh(sph(0.016, 8), m.gold, -0.06 + i * 0.03, 0.44, 0.07, s.root); // 훈장
  // 지휘봉
  const baton = new THREE.Group();
  baton.position.y = -0.23;
  mesh(cyl(0.016, 0.016, 0.24, 8), m.dark, 0, -0.08, 0, baton);
  mesh(sph(0.025, 8), m.gold, 0, -0.2, 0, baton);
  s.arms.r.add(baton);
  s.arms.r.rotation.x = -0.9;
  return { group, soldier: s, gunArm: s.arms.r };
}

function buildKnight(m, { classic = false } = {}) {
  const group = new THREE.Group();
  addBase(group, m, 0.34);
  const horse = new THREE.Group();
  horse.position.y = 0.06;
  group.add(horse);
  mesh(box(0.2, 0.2, 0.46), m.main, 0, 0.34, 0, horse);
  const horseLegs = [];
  for (const [x, z] of [[-0.065, 0.16], [0.065, 0.16], [0.065, -0.16], [-0.065, -0.16]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.27, z);
    mesh(box(0.06, 0.27, 0.06), m.main, 0, -0.135, 0, hip);
    mesh(box(0.066, 0.04, 0.075), m.dark, 0, -0.25, 0.005, hip);
    horse.add(hip);
    horseLegs.push(hip);
  }
  const neck = mesh(box(0.11, 0.26, 0.12), m.main, 0, 0.5, 0.22, horse);
  neck.rotation.x = 0.5;
  mesh(box(0.1, 0.1, 0.22), m.main, 0, 0.6, 0.34, horse);
  const mane = mesh(box(0.03, 0.22, 0.06), m.dark, 0, 0.53, 0.17, horse);
  mane.rotation.x = 0.5;
  for (const sx of [-1, 1]) mesh(box(0.025, 0.05, 0.025), m.main, 0.03 * sx, 0.67, 0.27, horse);
  const tail = mesh(box(0.04, 0.2, 0.04), m.dark, 0, 0.32, -0.26, horse);
  tail.rotation.x = -0.5;
  mesh(box(0.22, 0.03, 0.18), m.dark, 0, 0.45, -0.02, horse); // 안장
  // 기병
  const rider = classic ? medievalSoldier(m, { helm: 'great', scale: 0.82 }) : buildSoldier(m, { headgear: 'helmet', scale: 0.82 });
  rider.root.position.set(0, 0.25, -0.03);
  rider.legs.forEach((l, i) => { l.rotation.z = i ? 0.75 : -0.75; l.rotation.x = -0.4; });
  horse.add(rider.root);
  if (classic) return { group, horse, horseLegs, soldier: rider, gunArm: rider.arms.r };
  const saber = new THREE.Group();
  saber.position.y = -0.23;
  mesh(box(0.08, 0.016, 0.03), m.gold, 0, -0.02, 0, saber);
  mesh(box(0.016, 0.36, 0.04), m.silver, 0, -0.2, 0, saber);
  rider.arms.r.add(saber);
  rider.arms.r.rotation.x = -2.3;
  rider.arms.l.rotation.x = -1.0;
  return { group, horse, horseLegs, soldier: rider, gunArm: rider.arms.r };
}

function buildRook(m) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.15);
  group.add(body);
  for (const sx of [-1, 1]) {
    mesh(box(0.12, 0.14, 0.62), m.dark, 0.21 * sx, 0.08, 0, body);
    for (let k = -2; k <= 2; k++) {
      const w = mesh(cyl(0.05, 0.05, 0.125, 12), m.main, 0.21 * sx, 0.07, k * 0.12, body);
      w.rotation.z = Math.PI / 2;
    }
  }
  mesh(box(0.32, 0.13, 0.56), m.main, 0, 0.16, 0, body);
  mesh(box(0.28, 0.05, 0.18), m.dark, 0, 0.245, -0.15, body);
  const turret = new THREE.Group();
  turret.position.set(0, 0.25, 0.03);
  body.add(turret);
  mesh(cyl(0.15, 0.17, 0.12, 20), m.main, 0, 0.06, 0, turret);
  mesh(cyl(0.05, 0.05, 0.04, 12), m.dark, 0.05, 0.14, -0.05, turret);
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.07, 0.12);
  turret.add(barrel);
  const b = mesh(cyl(0.028, 0.032, 0.38, 12), m.dark, 0, 0, 0.19, barrel);
  b.rotation.x = Math.PI / 2;
  mesh(cyl(0.038, 0.038, 0.05, 12), m.dark, 0, 0, 0.37, barrel).rotation.x = Math.PI / 2;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.41);
  barrel.add(muzzle);
  return { group, body, turret, barrel, muzzle };
}

// ============================================================
// 고전 전투 (중세 기사) 모델
// ============================================================
const openCyl = (r, h) => geo(`oc${r},${h}`, () => new THREE.CylinderGeometry(r, r, h, 20, 1, true));
const cone = (r, h, s = 10) => cyl(0, r, h, s);

/** 중세 병사: 투구 종류 + 튜닉 + 가슴 문장 */
function medievalSoldier(m, { helm = 'kettle', scale = 1, emblem = true } = {}) {
  const s = buildSoldier(m, { headgear: 'none', scale });
  const r = s.root;
  mesh(cyl(0.115, 0.14, 0.13, 14), m.main, 0, 0.235, 0, r);   // 튜닉 아랫단
  mesh(cyl(0.142, 0.142, 0.014, 14), m.silver, 0, 0.172, 0, r); // 은색 테두리
  if (emblem) {
    mesh(box(0.026, 0.11, 0.01), m.gold, 0, 0.405, 0.068, r);
    mesh(box(0.08, 0.026, 0.01), m.gold, 0, 0.425, 0.068, r);
  }
  if (helm === 'kettle') {            // 챙 넓은 철모 (창병)
    mesh(hemi(0.09), m.main, 0, 0.615, 0, r);
    mesh(cyl(0.135, 0.135, 0.012, 22), m.silver, 0, 0.612, 0, r);
  } else if (helm === 'great') {      // 통투구 + 깃털 (기사)
    mesh(cyl(0.088, 0.088, 0.14, 18), m.main, 0, 0.62, 0, r);
    mesh(cyl(0.092, 0.092, 0.016, 18), m.silver, 0, 0.56, 0, r);
    mesh(box(0.12, 0.014, 0.01), m.dark, 0, 0.63, 0.088, r);
    mesh(box(0.02, 0.14, 0.01), m.silver, 0, 0.61, 0.09, r);
    const plume = mesh(cone(0.04, 0.16, 8), m.gold, 0, 0.76, -0.02, r);
    plume.rotation.x = -0.35;
  } else if (helm === 'hunter') {     // 챙 달린 사냥 모자 + 길게 휘어진 금색 깃털 (궁수)
    const hat = new THREE.Group();
    hat.position.set(0, 0.655, 0);
    r.add(hat);
    const brim = mesh(cyl(0.125, 0.125, 0.014, 20), m.dark, 0, -0.01, 0, hat);
    brim.scale.set(1, 1, 1.3);
    brim.rotation.x = 0.15;            // 앞은 내려가고 뒤는 올라간 챙
    const crown = mesh(cyl(0.035, 0.09, 0.12, 14), m.dark, 0, 0.05, -0.01, hat);
    crown.scale.z = 1.25;
    crown.rotation.x = 0.2;
    mesh(cyl(0.092, 0.092, 0.02, 14), m.gold, 0, 0.004, -0.005, hat).scale.z = 1.2; // 모자 띠
    // 깃털: 여러 마디를 조금씩 꺾어 뒤로 휘어지게
    let seg = new THREE.Group();
    seg.position.set(0.075, 0.02, 0.01);
    seg.rotation.set(-0.5, 0, -0.28);
    hat.add(seg);
    const widths = [0.04, 0.058, 0.062, 0.055, 0.042, 0.026];
    for (const w of widths) {
      mesh(box(0.01, 0.08, w), m.gold, 0, 0.04, 0, seg);
      const next = new THREE.Group();
      next.position.y = 0.08;
      next.rotation.x = -0.3;
      seg.add(next);
      seg = next;
    }
  } else if (helm === 'queen') {      // 높은 여왕 왕관 (투구 없음)
    const c = new THREE.Group();
    c.position.set(0, 0.675, 0);
    r.add(c);
    mesh(hemi(0.074), m.dark, 0, 0.01, 0, c);            // 왕관 안쪽 천
    mesh(openCyl(0.085, 0.055), m.gold, 0, 0.02, 0, c);   // 띠
    mesh(cyl(0.088, 0.088, 0.012, 20), m.gold, 0, -0.005, 0, c);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      mesh(cone(0.022, 0.08, 6), m.gold, Math.sin(a) * 0.08, 0.085, Math.cos(a) * 0.08, c);
      mesh(sph(0.013, 8), m.gold, Math.sin(a) * 0.08, 0.13, Math.cos(a) * 0.08, c);
    }
    mesh(box(0.014, 0.06, 0.014), m.gold, 0, 0.13, 0, c);   // 꼭대기 십자
    mesh(box(0.04, 0.014, 0.014), m.gold, 0, 0.14, 0, c);
  }
  return s;
}

function shield(m, arm) {
  const g = new THREE.Group();
  g.position.set(0.045, -0.15, 0.03);
  const d = mesh(cyl(0.12, 0.12, 0.024, 22), m.main, 0, 0, 0, g);
  d.rotation.z = Math.PI / 2;
  const rim = mesh(geo('srim', () => new THREE.TorusGeometry(0.12, 0.012, 6, 24)), m.silver, 0, 0, 0, g);
  rim.rotation.y = Math.PI / 2;
  mesh(box(0.01, 0.15, 0.03), m.gold, 0.014, 0, 0, g);
  mesh(box(0.01, 0.03, 0.12), m.gold, 0.014, 0.02, 0, g);
  g.rotation.y = -0.5;
  arm.add(g);
  return g;
}

function sword(m, arm, L = 0.36) {
  const g = new THREE.Group();
  g.position.y = -0.23;
  mesh(box(0.1, 0.018, 0.03), m.gold, 0, -0.02, 0, g);          // 가드
  mesh(box(0.022, L, 0.045), m.silver, 0, -0.03 - L / 2, 0, g);  // 칼날
  mesh(sph(0.018, 8), m.gold, 0, 0.05, 0, g);                   // 폼멜
  arm.add(g);
  return g;
}

function buildSpearman(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.28);
  const s = medievalSoldier(m, { helm: 'kettle' });
  s.root.position.y = 0.06;
  group.add(s.root);
  const spear = new THREE.Group();
  spear.position.y = -0.22;
  mesh(cyl(0.012, 0.012, 0.6, 6), m.wood, 0, -0.1, 0, spear);
  const tip = mesh(cone(0.03, 0.09, 8), m.silver, 0, -0.44, 0, spear);
  tip.rotation.x = Math.PI;
  s.arms.r.add(spear);
  s.arms.r.rotation.x = -2.4;
  shield(m, s.arms.l);
  s.arms.l.rotation.x = -0.45;
  return { group, soldier: s, gunArm: s.arms.r };
}

function buildArcher(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.29);
  const s = medievalSoldier(m, { helm: 'hunter', scale: 1.08 });
  s.root.position.y = 0.06;
  group.add(s.root);
  // 활: 왼손에 쥐고, 팔을 앞으로 뻗으면 세로로 섬
  const bow = new THREE.Group();
  bow.position.y = -0.235 + 0.2;
  bow.rotation.y = Math.PI / 2;
  const arc = mesh(geo('bow', () => new THREE.TorusGeometry(0.2, 0.012, 6, 20, Math.PI * 0.9)), m.wood, 0, 0, 0, bow);
  arc.rotation.z = Math.PI * 1.05;
  mesh(box(0.39, 0.004, 0.004), m.light, 0, -0.031, 0, bow);
  s.arms.l.add(bow);
  const bowHand = new THREE.Object3D();
  bowHand.position.set(0, -0.26, 0);
  s.arms.l.add(bowHand);
  s.arms.l.rotation.x = -0.3;
  s.arms.r.rotation.x = -0.2;
  // 화살통
  const quiver = mesh(cyl(0.035, 0.03, 0.24, 10), m.wood, 0.05, 0.45, -0.1, s.root);
  quiver.rotation.z = -0.35;
  for (let i = 0; i < 3; i++) mesh(box(0.008, 0.06, 0.008), m.light, 0.085 + i * 0.012, 0.6 - i * 0.004, -0.1, s.root);
  return { group, soldier: s, bowHand, archer: true };
}

function buildMountedKnight(m) {
  const parts = buildKnight(m, { classic: true });
  const rider = parts.soldier;
  // 마갑 (말 덮개)
  mesh(box(0.24, 0.17, 0.48), m.main, 0, 0.3, 0, parts.horse);
  mesh(box(0.245, 0.02, 0.485), m.gold, 0, 0.22, 0, parts.horse);
  const lance = new THREE.Group();
  lance.position.y = -0.22;
  mesh(cyl(0.024, 0.007, 0.95, 8), m.light, 0, -0.28, 0, lance);
  const vamp = mesh(cone(0.055, 0.1, 10), m.silver, 0, -0.02, 0, lance);
  vamp.rotation.x = Math.PI;
  rider.arms.r.add(lance);
  rider.arms.r.rotation.x = -2.15;
  shield(m, rider.arms.l);
  rider.arms.l.rotation.x = -0.6;
  return parts;
}

function buildSiegeTower(m) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  mesh(box(0.5, 0.08, 0.5), m.wood, 0, 0.12, 0, body);
  for (const [x, z] of [[-0.27, 0.17], [0.27, 0.17], [-0.27, -0.17], [0.27, -0.17]]) {
    const w = mesh(cyl(0.085, 0.085, 0.05, 14), m.wood, x, 0.085, z, body);
    w.rotation.z = Math.PI / 2;
    const hub = mesh(cyl(0.03, 0.03, 0.056, 8), m.silver, x, 0.085, z, body);
    hub.rotation.z = Math.PI / 2;
  }
  mesh(box(0.42, 0.5, 0.42), m.main, 0, 0.41, 0, body);
  for (const y of [0.3, 0.5]) mesh(box(0.44, 0.022, 0.44), m.dark, 0, y, 0, body);
  mesh(box(0.14, 0.2, 0.012), m.wood, 0, 0.27, 0.215, body);   // 문
  mesh(box(0.05, 0.08, 0.012), m.dark, 0, 0.5, 0.215, body);   // 창
  mesh(box(0.5, 0.05, 0.5), m.dark, 0, 0.68, 0, body);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    mesh(box(0.09, 0.08, 0.09), m.main, Math.sin(a) * 0.2, 0.745, Math.cos(a) * 0.2, body);
  }
  mesh(box(0.47, 0.012, 0.47), m.gold, 0, 0.705, 0, body);
  // 탑 위 투석기
  const frame = new THREE.Group();
  frame.position.set(0, 0.7, -0.02);
  body.add(frame);
  for (const sx of [-1, 1]) mesh(box(0.025, 0.12, 0.025), m.wood, 0.06 * sx, 0.07, 0, frame);
  const catapult = new THREE.Group();
  catapult.position.set(0, 0.12, 0);
  frame.add(catapult);
  mesh(box(0.028, 0.028, 0.34), m.wood, 0, 0, -0.15, catapult);
  const bucket = mesh(hemi(0.045), m.wood, 0, 0.015, -0.31, catapult);
  bucket.rotation.x = Math.PI;
  const stone = mesh(sph(0.035, 10), m.dark, 0, 0.03, -0.31, catapult);
  catapult.rotation.x = 0.25;
  return { group, body, catapult, stone };
}

function buildQueenKnight(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.31);
  const s = medievalSoldier(m, { helm: 'queen', scale: 1.15 });
  s.root.position.y = 0.06;
  group.add(s.root);
  // 바닥까지 넓게 퍼지는 드레스 + 금색 띠 3줄 (반지름: 아래 0.24 → 허리 0.11)
  mesh(cyl(0.11, 0.24, 0.34, 22), m.main, 0, 0.17, 0, s.root);
  for (const y of [0.02, 0.12, 0.22]) {
    const rr = 0.24 - (0.13 / 0.34) * y + 0.005;
    mesh(cyl(rr, rr, 0.016, 22), m.gold, 0, y, 0, s.root);
  }
  // 바닥까지 끌리는 망토 + 금색 테두리
  mesh(box(0.27, 0.52, 0.018), m.dark, 0, 0.26, -0.095, s.root);
  for (const sx of [-1, 1]) mesh(box(0.016, 0.52, 0.022), m.gold, 0.135 * sx, 0.26, -0.095, s.root);
  mesh(box(0.286, 0.016, 0.022), m.gold, 0, 0.008, -0.095, s.root);
  mesh(cyl(0.065, 0.075, 0.035, 14), m.gold, 0, 0.525, 0, s.root);   // 금색 옷깃
  for (const sx of [-1, 1]) mesh(box(0.08, 0.025, 0.1), m.gold, 0.12 * sx, 0.525, 0, s.root);
  sword(m, s.arms.r, 0.34);
  s.arms.r.rotation.x = -0.45;
  return { group, soldier: s, gunArm: s.arms.r };
}

function buildMedievalKing(m) {
  const group = new THREE.Group();
  addBase(group, m, 0.33);
  const s = medievalSoldier(m, { helm: 'none', scale: 1.32 });
  s.root.position.y = 0.06;
  group.add(s.root);
  // 왕관 (떨어뜨릴 수 있게 그룹으로)
  const crown = new THREE.Group();
  crown.position.set(0, 0.67, 0);
  mesh(openCyl(0.08, 0.05), m.gold, 0, 0, 0, crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    mesh(cone(0.02, 0.05, 6), m.gold, Math.sin(a) * 0.075, 0.045, Math.cos(a) * 0.075, crown);
  }
  mesh(sph(0.014, 8), m.dark, 0, 0, 0.081, crown);
  s.root.add(crown);
  mesh(box(0.27, 0.42, 0.02), m.dark, 0, 0.31, -0.08, s.root);   // 망토
  mesh(box(0.275, 0.02, 0.025), m.gold, 0, 0.1, -0.08, s.root);
  for (const sx of [-1, 1]) mesh(box(0.085, 0.03, 0.1), m.gold, 0.12 * sx, 0.525, 0, s.root);
  sword(m, s.arms.r, 0.4);
  s.arms.r.rotation.x = -0.45;
  return { group, soldier: s, gunArm: s.arms.r, crown };
}

const BUILDERS = {
  modern: { P: buildPawn, N: buildKnight, B: buildBishop, R: buildRook, Q: buildQueen, K: buildKing },
  classic: { P: buildSpearman, N: buildMountedKnight, B: buildArcher, R: buildSiegeTower, Q: buildQueenKnight, K: buildMedievalKing },
};

// ---------- 텍스처 ----------
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#6e4b2e';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * 512;
    x.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,24,12' : '150,110,70'},${0.08 + Math.random() * 0.14})`;
    x.lineWidth = 1 + Math.random() * 4;
    x.beginPath();
    x.moveTo(0, y);
    for (let px = 0; px <= 512; px += 32) x.lineTo(px, y + Math.sin(px / 60 + i) * 4);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#6f6a60';
  x.fillRect(0, 0, 512, 512);
  const rows = 8, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let px = (r % 2) * -40;
    while (px < 512) {
      const w = 70 + Math.random() * 60;
      const v = 125 + Math.floor(Math.random() * 35);
      x.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      x.fillRect(px + 3, r * h + 3, w - 6, h - 6);
      px += w;
    }
  }
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(text, color = '#f0d9ae') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.font = 'bold 44px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ============================================================
class Board3DView {
  constructor() {
    this.ok = false;
    this.failed = false;
    this.visible = false;
    this.pieces = new Map();   // sq → piece
    this.queue = [];
    this.animating = false;
    this.epoch = 0;
    this.tasks = new Set();
    this.idleWaiters = [];
    this.gameId = null;
    this.ply = -1;
    this.fx = 'normal';
    this.theme = 'classic';
    this.envs = {};
    this.orientation = 'w';
    this.latest = null;
    this.resultHandled = false;
    this.needsRebuild = true;
    this.onSquare = null;
    this._loop = this._loop.bind(this);
  }

  // ---------- 초기화 ----------
  mount(container) {
    if (this.ok || this.failed) return this.ok;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      console.warn('WebGL 사용 불가', e);
      this.failed = true;
      return false;
    }
    const r = this.renderer;
    this.container = container;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.style.display = 'block';
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
    container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x2a231d);
    scene.fog = new THREE.Fog(0x2a231d, 20, 38);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const ctl = (this.controls = new OrbitControls(this.camera, r.domElement));
    ctl.enableDamping = true;
    ctl.enablePan = false;
    ctl.minDistance = 7;
    ctl.maxDistance = 20;
    ctl.maxPolarAngle = 1.32;
    ctl.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xfff3dd, 0x4a3524, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(5, 11, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe2b8, 0.5);
    fill.position.set(-6, 5, -5);
    scene.add(fill);
    this.fxLight = new THREE.PointLight(0xffb050, 0, 4, 2);
    scene.add(this.fxLight);

    this.envs = { modern: this._buildModernEnv(), classic: this._buildClassicEnv() };
    for (const env of Object.values(this.envs)) scene.add(env.group);
    this._envDirty = true;
    this.setTheme(this.theme);
    this.pieceGroup = new THREE.Group();
    this.hlGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    scene.add(this.pieceGroup, this.hlGroup, this.fxGroup);
    this._makeHighlightAssets();

    // 클릭(탭) 판정: 드래그(회전)와 구분
    this.raycaster = new THREE.Raycaster();
    r.domElement.addEventListener('pointerdown', (e) => { this._down = { x: e.clientX, y: e.clientY }; });
    r.domElement.addEventListener('pointerup', (e) => {
      const d = this._down;
      this._down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const sq = this._pick(e);
      if (sq >= 0 && this.onSquare && !this.showcase) this.onSquare(sq);
    });
    r.domElement.style.cursor = 'pointer';
    r.domElement.style.touchAction = 'none';

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(container);
    this._setCamera(this.orientation, false);
    this.ok = true;
    return true;
  }

  /** 캔버스를 다른 영역(홈 배경 ↔ 게임 보드)으로 옮김 */
  attach(container) {
    if (!this.ok || this.container === container) return;
    this._ro.unobserve(this.container);
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this._ro.observe(container);
    this._resize();
  }

  /** 홈 화면 배경: 시작 배치의 고전 전투 보드를 천천히 회전 */
  startShowcase(container) {
    if (!this.ok) return;
    this.attach(container);
    this.showcase = true;
    this.setTheme('classic');
    const ctl = this.controls;
    ctl.enabled = false;
    ctl.autoRotate = true;
    ctl.autoRotateSpeed = 0.55;
    this.setVisible(true);
    const board = 'rnbqkbnrpppppppp'.split('').concat(Array(32).fill(null), 'PPPPPPPPRNBQKBNR'.split(''));
    this.update({ gameId: 'showcase', ply: 0, board, lastMove: null, orientation: 'w', selected: -1, targets: [], checkSq: -1, result: null });
    this.camera.position.set(0, 6.2, 11.5);
    ctl.update();
  }

  stopShowcase() {
    if (!this.ok || !this.showcase) return;
    this.showcase = false;
    this.controls.enabled = true;
    this.controls.autoRotate = false;
    this.gameId = null; // 다음 게임에서 다시 배치 + 카메라 초기화
    this.setVisible(false);
  }

  /** 체스판 + 테두리 + 좌표 글자 (모드별 색) */
  _buildBoardInto(group, o) {
    const light = new THREE.MeshStandardMaterial({ color: o.light, roughness: o.rough });
    const dark = new THREE.MeshStandardMaterial({ color: o.dark, roughness: o.rough });
    const tiles = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = sqPos(sq);
      const t = mesh(box(1, 0.1, 1), ((sq >> 3) + (sq & 7)) % 2 ? dark : light, p.x, -0.05, p.z, group);
      t.receiveShadow = true;
      t.userData.sq = sq;
      tiles.push(t);
    }
    const frame = mesh(box(9.1, 0.18, 9.1), new THREE.MeshStandardMaterial({ color: o.frame, roughness: 0.55 }), 0, -0.11, 0, group);
    frame.receiveShadow = true;
    frame.castShadow = true;
    const lg = new THREE.PlaneGeometry(0.34, 0.34);
    const label = (txt, x, z, flip) => {
      const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ map: labelTexture(txt, o.label), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      if (flip) m.rotation.z = Math.PI;
      m.position.set(x, -0.015, z);
      group.add(m);
    };
    for (let i = 0; i < 8; i++) {
      label('abcdefgh'[i], i - 3.5, 4.27, false);
      label('abcdefgh'[i], i - 3.5, -4.27, true);
      label(String(8 - i), -4.27, i - 3.5, false);
      label(String(8 - i), 4.27, i - 3.5, true);
    }
    return tiles;
  }

  _buildModernEnv() {
    const g = new THREE.Group();
    const tiles = this._buildBoardInto(g, { light: 0xead3a6, dark: 0x9c6b45, rough: 0.6, frame: 0x5b3a22, label: '#f0d9ae' });
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.2;
    desk.receiveShadow = true;
    g.add(desk);
    return { group: g, tiles, bg: 0x2a231d, fog: [20, 38] };
  }

  _buildClassicEnv() {
    const g = new THREE.Group();
    const tiles = this._buildBoardInto(g, { light: 0xdcd5c6, dark: 0x56585f, rough: 0.8, frame: 0x8b867b, label: '#2f2c27' });
    // 성 안뜰 돌바닥
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    g.add(ground);
    // 성벽 + 톱니 + 깃발
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9b9486, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e2f28, roughness: 0.7 });
    const bannerW = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.8, side: THREE.DoubleSide });
    const bannerB = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.8, side: THREE.DoubleSide });
    const goldM = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.6, roughness: 0.35 });
    const D = 17, L = 34, H = 4.2;
    for (let i = 0; i < 4; i++) {
      const side = new THREE.Group();
      side.rotation.y = (i * Math.PI) / 2;
      g.add(side);
      mesh(box(L, H, 1.4), wallMat, 0, H / 2 - 0.2, -D, side);
      for (let x = -L / 2 + 0.8; x < L / 2; x += 1.6) mesh(box(0.8, 0.7, 1.4), wallMat, x, H + 0.15, -D, side);
      for (let k = -2; k <= 2; k++) {
        const ban = mesh(geo('banner', () => new THREE.PlaneGeometry(1.1, 2.4)), (k + i) % 2 ? bannerW : bannerB, k * 5.5, H - 1.6, -D + 0.72, side);
        ban.rotation.y = 0;
        mesh(box(1.2, 0.08, 0.08), goldM, k * 5.5, H - 0.38, -D + 0.75, side);
        mesh(box(0.12, 1.4, 0.02), goldM, k * 5.5, H - 1.6, -D + 0.74, side);
      }
    }
    for (const [x, z] of [[-D, -D], [D, -D], [-D, D], [D, D]]) {
      mesh(cyl(2, 2.2, 6.5, 16), wallMat, x, 3.05, z, g);
      mesh(cone(2.6, 3, 16), roofMat, x, 7.8, z, g);
    }
    return { group: g, tiles, bg: 0x9fb6cb, fog: [24, 52] };
  }

  setTheme(theme) {
    const t = theme === 'modern' ? 'modern' : 'classic';
    if (t === this.theme && !this._envDirty) return;
    this.theme = t;
    this._envDirty = false;
    if (!this.ok && !this.scene) return;
    for (const [name, env] of Object.entries(this.envs)) env.group.visible = name === t;
    const env = this.envs[t];
    this.tiles = env.tiles;
    this.scene.background = new THREE.Color(env.bg);
    this.scene.fog = new THREE.Fog(env.bg, env.fog[0], env.fog[1]);
    this.needsRebuild = true;
  }

  _makeHighlightAssets() {
    const mk = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.HL = {
      plane: new THREE.PlaneGeometry(0.98, 0.98),
      dot: new THREE.CircleGeometry(0.14, 24),
      ring: new THREE.RingGeometry(0.37, 0.47, 36),
      checkRing: new THREE.RingGeometry(0.28, 0.49, 36),
      last: mk(0xf3d24c, 0.42),
      sel: mk(0x58c25a, 0.55),
      dotM: mk(0x1c3a1c, 0.5),
      cap: mk(0xd2432f, 0.7),
      check: mk(0xff2a1a, 0.65),
    };
  }

  _resize() {
    if (!this.ok) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _setCamera(o, animate) {
    this.orientation = o;
    const end = new THREE.Vector3(0, 9.4, o === 'w' ? 8.4 : -8.4);
    if (!animate) {
      this.camera.position.copy(end);
      this.controls.update();
      return;
    }
    const s = new THREE.Spherical().setFromVector3(this.camera.position);
    const e = new THREE.Spherical().setFromVector3(end);
    let dth = ((e.theta - s.theta) % TAU + TAU + Math.PI) % TAU - Math.PI;
    const t0 = performance.now();
    const task = (now) => {
      const t = Math.min(1, (now - t0) / 700), k = easeInOut(t);
      this.camera.position.setFromSphericalCoords(lerp(s.radius, e.radius, k), lerp(s.phi, e.phi, k), s.theta + dth * k);
      if (t >= 1) this.tasks.delete(task);
    };
    this.tasks.add(task);
  }

  resetCamera() {
    if (this.ok) this._setCamera(this.orientation, true);
  }

  setVisible(v) {
    if (!this.ok || v === this.visible) return;
    this.visible = v;
    if (v) {
      this._resize();
      if (!this.raf) this.raf = requestAnimationFrame(this._loop);
    } else {
      this._cancelAll();
      this.needsRebuild = true;
      this._resolveIdle();
    }
  }

  setFx(mode) {
    this.fx = SPEED[mode] ? mode : 'normal';
  }

  _loop(now) {
    if (!this.visible) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this._loop);
    for (const t of [...this.tasks]) t(now);
    if (this.checkRing) {
      const k = Math.sin(now / 140);
      this.checkRing.scale.setScalar(1 + 0.08 * k);
      this.checkRing.material.opacity = 0.5 + 0.25 * k;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- 트윈 ----------
  speed() { return SPEED[this.fx] || 1; }

  tween(dur, fn, easing = easeInOut) {
    const ep = this.epoch;
    const d = Math.max(1, dur / this.speed());
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const task = (now) => {
        if (ep !== this.epoch) { this.tasks.delete(task); reject(new Cancel()); return; }
        const t = Math.min(1, (now - start) / d);
        fn(easing(t), t);
        if (t >= 1) { this.tasks.delete(task); resolve(); }
      };
      this.tasks.add(task);
    });
  }

  wait(ms) { return this.tween(ms, () => {}, linear); }

  /** 끝까지 기다리지 않는 효과용: 취소돼도 오류를 내지 않음 */
  safe(p) { return p.catch((e) => { if (!(e instanceof Cancel)) console.warn(e); }); }

  _cancelAll() {
    this.epoch++;
    const now = performance.now();
    for (const t of [...this.tasks]) t(now);
    this.queue = [];
    this.animating = false;
  }

  whenIdle() {
    if (!this.ok || !this.visible || (!this.animating && !this.queue.length)) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  _resolveIdle() {
    const w = this.idleWaiters;
    this.idleWaiters = [];
    w.forEach((r) => r());
  }

  // ---------- 기물 관리 ----------
  _createPiece(code) {
    const color = code === code.toUpperCase() ? 'w' : 'b';
    const type = code.toUpperCase();
    const mats = makeMats(color, this.theme);
    const parts = BUILDERS[this.theme][type](mats);
    const g = parts.group;
    g.rotation.order = 'YXZ';
    g.rotation.y = homeAngle(color);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const piece = { code, type, color, mats, group: g, parts };
    g.userData.piece = piece;
    return piece;
  }

  _place(piece, sq) {
    piece.group.position.copy(sqPos(sq));
    piece.group.userData.sq = sq;
    this.pieceGroup.add(piece.group);
    this.pieces.set(sq, piece);
  }

  _remove(piece) {
    this.pieceGroup.remove(piece.group);
    for (const m of Object.values(piece.mats)) m.dispose();
  }

  _clearFx() {
    for (const m of [...this.fxGroup.children]) this._killFx(m);
    this.fxLight.intensity = 0;
  }

  _rebuild(st) {
    this._cancelAll();
    for (const g of [...this.pieceGroup.children]) {
      const p = g.userData.piece;
      if (p) this._remove(p);
      else this.pieceGroup.remove(g);
    }
    this.pieces.clear();
    this._clearFx();
    st.board.forEach((code, sq) => { if (code) this._place(this._createPiece(code), sq); });
    this.ply = st.ply;
    this.resultHandled = false;
  }

  _matches(board) {
    for (let sq = 0; sq < 64; sq++) {
      const p = this.pieces.get(sq);
      if ((p ? p.code : null) !== (board[sq] || null)) return false;
    }
    return true;
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(this.pieceGroup.children, true)) {
      let o = hit.object;
      while (o && o.userData.sq === undefined) o = o.parent;
      if (o && !o.userData.dying) return o.userData.sq;
    }
    const t = this.raycaster.intersectObjects(this.tiles, false)[0];
    return t ? t.object.userData.sq : -1;
  }

  // ---------- 외부 API ----------
  /**
   * st: { gameId, ply, board, lastMove, orientation, selected, targets:[{to,capture}], checkSq, result }
   */
  update(st) {
    if (!this.ok) return;
    this.latest = st;
    const newGame = st.gameId !== this.gameId;
    if (newGame) {
      this.gameId = st.gameId;
      this._setCamera(st.orientation, false);
    } else if (st.orientation !== this.orientation) {
      this._setCamera(st.orientation, true);
    }
    if (newGame || this.needsRebuild) {
      this.needsRebuild = false;
      this._rebuild(st);
    } else if (st.ply !== this.ply) {
      const oneMore = st.ply === this.ply + 1 && st.lastMove;
      if (oneMore && this.fx !== 'off' && this.visible) {
        this.queue.push(st);
        this.ply = st.ply;
      } else {
        if (oneMore) {
          snd(st.lastMove.captured ? 'capture' : 'move');
          if (st.lastMove.san && st.lastMove.san.endsWith('+')) snd('check');
        }
        this._rebuild(st);
      }
    }
    this._drawHighlights(st);
    this._pump();
  }

  async _pump() {
    if (this.animating) return;
    const ep = this.epoch;
    if (this.queue.length) {
      const st = this.queue.shift();
      this.animating = true;
      let failed = false;
      try {
        await this._animateMove(st);
      } catch (e) {
        if (ep !== this.epoch) return;
        if (!(e instanceof Cancel)) console.warn(e);
        failed = true;
      }
      if (ep !== this.epoch) return;
      this.animating = false;
      if (failed || !this._matches(st.board)) {
        const latest = this.latest;
        this._rebuild(latest);
        this._drawHighlights(latest);
      }
      return this._pump();
    }
    const st = this.latest;
    if (st && st.result && !this.resultHandled && this.fx !== 'off') {
      this.resultHandled = true;
      this.animating = true;
      try {
        await this._ending(st.result);
      } catch (e) {
        if (ep !== this.epoch) return;
        if (!(e instanceof Cancel)) console.warn(e);
      }
      if (ep !== this.epoch) return;
      this.animating = false;
    }
    this._resolveIdle();
  }

  _drawHighlights(st) {
    const H = this.HL;
    this.hlGroup.clear();
    const add = (g, mat, sq, y) => {
      const m = new THREE.Mesh(g, mat);
      const p = sqPos(sq);
      m.position.set(p.x, y, p.z);
      m.rotation.x = -Math.PI / 2;
      this.hlGroup.add(m);
      return m;
    };
    if (st.lastMove) {
      add(H.plane, H.last, st.lastMove.from, 0.002);
      add(H.plane, H.last, st.lastMove.to, 0.002);
    }
    if (st.selected >= 0) add(H.plane, H.sel, st.selected, 0.003);
    for (const t of st.targets || []) {
      if (t.capture) add(H.ring, H.cap, t.to, 0.004);
      else add(H.dot, H.dotM, t.to, 0.004);
    }
    this.checkRing = st.checkSq >= 0 ? add(H.checkRing, H.check, st.checkSq, 0.005) : null;
  }

  // ---------- 효과 ----------
  _fxMesh(g, color, opts) {
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, depthWrite: false }, opts)));
    this.fxGroup.add(m);
    return m;
  }

  _killFx(m) {
    this.fxGroup.remove(m);
    m.traverse((o) => o.material?.dispose());
  }

  _pulseLight(pos, intensity, dur) {
    const L = this.fxLight;
    L.position.copy(pos);
    L.intensity = intensity;
    return this.safe(this.tween(dur, (e) => { L.intensity = intensity * (1 - e); }, linear));
  }

  _flash(pos, size = 0.1, color = 0xffd27a, dur = 110) {
    const m = this._fxMesh(sph(1, 12), color);
    m.position.copy(pos);
    this._pulseLight(pos, 6 * size * 10, dur * 1.6);
    return this.safe(this.tween(dur, (e, t) => { m.scale.setScalar(size * (0.6 + t * 0.9)); m.material.opacity = 1 - t; }, linear))
      .then(() => this._killFx(m));
  }

  _smoke(pos, n = 4, color = 0x9a9a9a, size = 0.1) {
    for (let i = 0; i < n; i++) {
      const m = this._fxMesh(sph(1, 10), color, { opacity: 0.6 });
      const off = new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.1, (Math.random() - 0.5) * 0.15);
      const p0 = pos.clone().add(off);
      const rise = 0.25 + Math.random() * 0.3, s0 = size * (0.6 + Math.random() * 0.6);
      m.position.copy(p0);
      this.safe(this.tween(700 + Math.random() * 500, (e, t) => {
        m.position.set(p0.x + off.x * t * 2, p0.y + rise * e, p0.z + off.z * t * 2);
        m.scale.setScalar(s0 * (1 + t * 1.6));
        m.material.opacity = 0.6 * (1 - t);
      }, easeOut)).then(() => this._killFx(m));
    }
  }

  _hitPuff(pos) {
    this._smoke(pos, 3, 0xe8e2d6, 0.05);
  }

  async _projectile(from, to, color, dur, size = [0.02, 0.02, 0.17]) {
    const m = this._fxMesh(sph(1, 8), color);
    m.scale.set(...size);
    m.position.copy(from);
    m.lookAt(to);
    try {
      await this.tween(dur, (e) => m.position.lerpVectors(from, to, e), linear);
    } finally {
      this._killFx(m);
    }
  }

  _explosion(pos) {
    snd('explosion');
    this._pulseLight(pos, 14, 600);
    const core = this._fxMesh(sph(1, 16), 0xffd36a);
    const outer = this._fxMesh(sph(1, 16), 0xff7a2a, { opacity: 0.8 });
    core.position.copy(pos);
    outer.position.copy(pos);
    this.safe(this.tween(500, (e, t) => {
      core.scale.setScalar(0.05 + e * 0.35);
      outer.scale.setScalar(0.08 + e * 0.6);
      core.material.opacity = 1 - t;
      outer.material.opacity = 0.8 * (1 - t);
    }, easeOut)).then(() => { this._killFx(core); this._killFx(outer); });
    for (let i = 0; i < 9; i++) {
      const d = this._fxMesh(box(0.05, 0.05, 0.05), i % 2 ? 0x3d3d3d : 0x7a5a3a, { opacity: 1 });
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3);
      d.position.copy(pos);
      this.safe(this.tween(750, (e, t) => {
        d.position.set(pos.x + v.x * t, Math.max(0.03, pos.y + v.y * t - 4.5 * t * t), pos.z + v.z * t);
        d.rotation.set(t * 9, t * 7, 0);
        d.material.opacity = 1 - t * t;
      }, linear)).then(() => this._killFx(d));
    }
    this._smoke(pos, 7, 0x5e5e5e, 0.16);
  }

  _sparkle(pos) {
    const g = geo('spark', () => new THREE.OctahedronGeometry(0.05));
    for (let i = 0; i < 18; i++) {
      const m = this._fxMesh(g, i % 3 ? 0xffd75a : 0xffffff);
      const a = (i / 18) * TAU, r = 0.25 + Math.random() * 0.25, h = 0.6 + Math.random() * 0.8;
      this.safe(this.tween(900 + Math.random() * 300, (e, t) => {
        m.position.set(pos.x + Math.cos(a + t * 2) * r * e, pos.y + h * e, pos.z + Math.sin(a + t * 2) * r * e);
        m.rotation.y = t * 8;
        m.material.opacity = 1 - t;
      }, easeOut)).then(() => this._killFx(m));
    }
  }

  // ---------- 동작 ----------
  async _turnTo(piece, angle) {
    const g = piece.group, a0 = g.rotation.y;
    const d = (((angle - a0) % TAU) + TAU + Math.PI) % TAU - Math.PI;
    if (Math.abs(d) < 0.02) { g.rotation.y = angle; return; }
    await this.tween(140 + (Math.abs(d) / Math.PI) * 240, (e) => { g.rotation.y = a0 + d * e; });
  }

  _armTo(arm, angle, dur) {
    const a0 = arm.rotation.x;
    return this.tween(dur, (e) => { arm.rotation.x = lerp(a0, angle, e); });
  }

  async _travel(piece, a, b, style, opt = {}) {
    const g = piece.group, P = piece.parts;
    const dist = a.distanceTo(b);
    if (dist < 0.01) return;
    let dur, steps = 2;
    if (style === 'tank') {
      dur = 420 + dist * 300;
      snd('roll', dur / 1000 / this.speed());
    } else if (style === 'gallop') {
      dur = 330 + dist * 190;
      steps = Math.max(2, Math.round(dist * 2));
      snd('gallop', steps + 1);
    } else {
      dur = 260 + dist * 330;
      steps = Math.max(2, Math.round(dist * 2.4));
      snd(this.theme === 'classic' ? 'armorStep' : 'step', steps, dur / steps / 1000 / this.speed());
    }
    const arc = opt.arc ?? (style === 'gallop' ? 0.25 + dist * 0.12 : 0);
    const legs = P.horse ? P.horseLegs : P.soldier ? P.soldier.legs : null;
    const swing = style === 'gallop' ? 0.7 : 0.55;
    try {
      await this.tween(dur, (e, t) => {
        g.position.x = lerp(a.x, b.x, e);
        g.position.z = lerp(a.z, b.z, e);
        const bob = Math.abs(Math.sin(t * steps * Math.PI));
        g.position.y = style === 'march' ? bob * 0.05 : style === 'gallop' ? Math.sin(Math.PI * e) * arc + bob * 0.04 : 0;
        if (legs) {
          const s = Math.sin(t * steps * Math.PI) * swing;
          legs.forEach((l, i) => { l.rotation.x = i % 2 ? s : -s; });
        }
        if (P.horse) P.horse.rotation.x = Math.sin(t * steps * Math.PI * 2) * 0.06;
        if (P.body) P.body.position.y = Math.sin(t * 70) * 0.006;
      }, style === 'tank' ? easeInOut : linear);
    } finally {
      g.position.y = 0;
      if (legs) legs.forEach((l) => { l.rotation.x = 0; });
      if (P.horse) P.horse.rotation.x = 0;
      if (P.body) P.body.position.y = 0;
    }
  }

  async _knock(victim, dir, kind) {
    const g = victim.group;
    g.userData.dying = true;
    for (const m of Object.values(victim.mats)) { m.transparent = true; m.needsUpdate = true; }
    const blast = kind === 'blast';
    const dist = blast ? 2.3 : 1.5, up = blast ? 1.8 : 0.75;
    const spin = (blast ? 10 : 6.5) * (0.85 + Math.random() * 0.3);
    const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const p0 = g.position.clone(), q0 = g.quaternion.clone(), q = new THREE.Quaternion();
    snd('fall');
    if (this.theme === 'classic') snd('clank');
    try {
      await this.tween(blast ? 1100 : 900, (e, t) => {
        const h = up * Math.sin(Math.PI * Math.min(1, t * 1.15));
        g.position.set(p0.x + dir.x * dist * t, Math.max(0, h), p0.z + dir.z * dist * t);
        q.setFromAxisAngle(axis, spin * easeOut(t));
        g.quaternion.copy(q).multiply(q0);
        const a = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        for (const m of Object.values(victim.mats)) m.opacity = a;
      }, linear);
    } finally {
      this._remove(victim);
    }
  }

  async _gunAttack(piece, tgt, o) {
    const P = piece.parts, arm = P.gunArm, a0 = arm.rotation.x, aim = -Math.PI / 2 + 0.05;
    await this._armTo(arm, aim, o.aim);
    if (P.scope) {
      piece.group.updateMatrixWorld(true);
      this._flash(P.scope.getWorldPosition(new THREE.Vector3()), 0.07, 0xffffff, 200);
      await this.wait(380);
    }
    for (let i = 0; i < o.shots; i++) {
      piece.group.updateMatrixWorld(true);
      const mp = P.muzzle.getWorldPosition(new THREE.Vector3());
      snd(o.sound);
      this._flash(mp, o.flash || 0.09);
      this._smoke(mp, 2, 0xbbbbbb, 0.045);
      arm.rotation.x = aim - 0.3; // 반동
      await this._projectile(mp, tgt, o.tracer || 0xffe9a0, o.speed || 110);
      this._hitPuff(tgt);
      await this._armTo(arm, aim, 90);
      if (i < o.shots - 1) await this.wait(120);
    }
    this.safe(this._armTo(arm, a0, 300));
  }

  async _tankAttack(piece, tgt) {
    const P = piece.parts;
    piece.group.updateMatrixWorld(true);
    const mp = P.muzzle.getWorldPosition(new THREE.Vector3());
    snd('cannon');
    this._flash(mp, 0.24, 0xffc060, 170);
    this._smoke(mp, 6, 0x8a8a8a, 0.12);
    const bz = P.barrel.position.z;
    this.safe(this.tween(380, (e) => { P.barrel.position.z = bz - 0.09 * (1 - e); }, easeOut));
    this.safe(this.tween(320, (e, t) => { P.body.rotation.x = -0.12 * Math.sin(Math.PI * t); }, linear));
    await this._projectile(mp, tgt, 0x2d2d2d, 170, [0.045, 0.045, 0.07]);
    this._explosion(tgt);
  }

  /**
   * 근접 공격 공통: 다가가서(travel) → 무기 들기(raise) → 치기(strike) → 상대 날아감 → 칸으로 이동
   * o: { travel, stop, during, raise, strike, strikeDur, swing, hit }
   */
  async _meleeAttack(piece, victim, from, vpos, to, o) {
    const P = piece.parts, arm = P.gunArm, a0 = arm.rotation.x;
    const dir = vpos.clone().sub(from).setY(0).normalize();
    const stop = vpos.clone().addScaledVector(dir, -o.stop);
    if (o.during != null) this.safe(this._armTo(arm, o.during, 260));
    await this._travel(piece, from, stop, o.travel);
    if (o.raise != null) await this._armTo(arm, o.raise, 220);
    if (o.swing) snd(o.swing);
    await this._armTo(arm, o.strike, o.strikeDur || 130);
    snd(o.hit);
    this._flash(vpos.clone().setY(0.5), 0.13, 0xfff6d0, 130);
    const k = this._knock(victim, dir, 'hit');
    await this.wait(200);
    this.safe(this._armTo(arm, a0, 300));
    await this._travel(piece, stop, to, o.travel, { arc: 0.04 });
    await k;
  }

  /** 포물선으로 날아가는 물체 (화살, 돌) */
  async _arc(obj, from, to, dur, height, orient) {
    this.fxGroup.add(obj);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const at = (e, out) => { out.lerpVectors(from, to, e); out.y += 4 * height * e * (1 - e); return out; };
    try {
      await this.tween(dur, (e) => {
        obj.position.copy(at(e, p));
        if (orient) obj.lookAt(at(Math.min(1, e + 0.03), q));
      }, linear);
    } finally {
      this._killFx(obj);
    }
  }

  _arrowMesh() {
    const g = new THREE.Group();
    const mk = (c) => new THREE.MeshBasicMaterial({ color: c });
    mesh(box(0.014, 0.014, 0.32), mk(0x8a5a2b), 0, 0, 0, g);
    const tip = mesh(cone(0.022, 0.06, 6), mk(0xd8dce0), 0, 0, 0.18, g);
    tip.rotation.x = Math.PI / 2;
    mesh(box(0.05, 0.004, 0.07), mk(0xf4f1ea), 0, 0, -0.14, g);
    mesh(box(0.004, 0.05, 0.07), mk(0xf4f1ea), 0, 0, -0.14, g);
    return g;
  }

  async _archerAttack(piece, tgt) {
    const P = piece.parts, L = P.soldier.arms.l, R = P.soldier.arms.r;
    const l0 = L.rotation.x, r0 = R.rotation.x;
    await Promise.all([this._armTo(L, -Math.PI / 2, 260), this._armTo(R, -1.75, 260)]);
    await this._armTo(R, -1.3, 320);          // 시위 당기기
    snd('twang');
    R.rotation.x = -1.7;
    piece.group.updateMatrixWorld(true);
    const start = P.bowHand.getWorldPosition(new THREE.Vector3());
    const dist = start.distanceTo(tgt);
    await this._arc(this._arrowMesh(), start, tgt, 200 + dist * 45, 0.12 + dist * 0.04, true);
    snd('thunk');
    this._hitPuff(tgt);
    this.safe(this._armTo(L, l0, 300));
    this.safe(this._armTo(R, r0, 300));
  }

  async _catapultAttack(piece, tgt) {
    const P = piece.parts, c = P.catapult, a0 = c.rotation.x;
    snd('creak');
    await this.tween(320, (e) => { c.rotation.x = a0 - 0.3 * e; });
    snd('catapult');
    let start = null;
    await this.tween(200, (e) => {
      c.rotation.x = lerp(a0 - 0.3, 2.3, e);
      if (!start && e > 0.7) {
        piece.group.updateMatrixWorld(true);
        start = P.stone.getWorldPosition(new THREE.Vector3());
        P.stone.visible = false;
      }
    }, easeIn);
    if (!start) start = P.stone.getWorldPosition(new THREE.Vector3());
    this.safe(this.tween(500, (e) => { c.rotation.x = lerp(2.3, a0, e); })).then(() => { P.stone.visible = true; });
    const rock = new THREE.Mesh(sph(0.06, 10), new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.9 }));
    const dist = start.distanceTo(tgt);
    await this._arc(rock, start, tgt, 380 + dist * 60, 0.9 + dist * 0.12, false);
    this._impact(tgt);
  }

  _impact(pos) {
    snd('impact');
    this._pulseLight(pos, 4, 300);
    for (let i = 0; i < 10; i++) {
      const d = this._fxMesh(box(0.06, 0.05, 0.06), i % 2 ? 0x7c7a74 : 0x9a968d, { opacity: 1 });
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.6, 1 + Math.random() * 1.8, (Math.random() - 0.5) * 2.6);
      d.position.copy(pos);
      this.safe(this.tween(700, (e, t) => {
        d.position.set(pos.x + v.x * t, Math.max(0.03, pos.y + v.y * t - 4.5 * t * t), pos.z + v.z * t);
        d.rotation.set(t * 8, t * 6, 0);
        d.material.opacity = 1 - t * t;
      }, linear)).then(() => this._killFx(d));
    }
    this._smoke(pos, 8, 0x8f8070, 0.15);
  }

  /** 현대전 공격 */
  async _modernAttack(mover, victim, from, vpos, to) {
    const type = mover.type;
    const tgt = vpos.clone().setY(0.4);
    const dir = vpos.clone().sub(from).setY(0).normalize();
    if (type === 'N') return this._meleeAttack(mover, victim, from, vpos, to, { travel: 'gallop', stop: 0.62, during: -2.9, strike: -0.35, hit: 'clash' });
    if (type === 'K') return this._meleeAttack(mover, victim, from, vpos, to, { travel: 'march', stop: 0.55, raise: -2.8, strike: -0.45, hit: 'bonk' });
    if (type === 'R') await this._tankAttack(mover, tgt);
    else if (type === 'B') await this._gunAttack(mover, tgt, { shots: 1, sound: 'sniper', aim: 380, flash: 0.11, tracer: 0xfff3b0, speed: 90 });
    else if (type === 'Q') await this._gunAttack(mover, tgt, { shots: 2, sound: 'pistol', aim: 220, flash: 0.07 });
    else await this._gunAttack(mover, tgt, { shots: 1, sound: 'shot', aim: 260 });
    const k = this._knock(victim, dir, type === 'R' ? 'blast' : 'hit');
    await this.wait(type === 'R' ? 450 : 300);
    await this._travel(mover, from, to, styleOf(type));
    await k;
  }

  /** 고전 전투 공격 */
  async _classicAttack(mover, victim, from, vpos, to) {
    const type = mover.type;
    const tgt = vpos.clone().setY(0.4);
    const dir = vpos.clone().sub(from).setY(0).normalize();
    switch (type) {
      case 'P': // 창 찌르기
        return this._meleeAttack(mover, victim, from, vpos, to, { travel: 'march', stop: 0.8, raise: -2.9, strike: -1.5, strikeDur: 110, swing: 'thrust', hit: 'thunk' });
      case 'N': // 랜스 돌격
        return this._meleeAttack(mover, victim, from, vpos, to, { travel: 'gallop', stop: 0.5, during: -1.5, strike: -1.42, strikeDur: 60, hit: 'lance' });
      case 'Q': // 검 베기
        return this._meleeAttack(mover, victim, from, vpos, to, { travel: 'march', stop: 0.55, raise: -2.8, strike: -0.35, swing: 'whoosh', hit: 'clash' });
      case 'K': // 검 내려치기
        return this._meleeAttack(mover, victim, from, vpos, to, { travel: 'march', stop: 0.55, raise: -3.0, strike: -0.5, strikeDur: 160, swing: 'whoosh', hit: 'clash' });
    }
    if (type === 'B') await this._archerAttack(mover, tgt);
    else await this._catapultAttack(mover, tgt);
    const k = this._knock(victim, dir, type === 'R' ? 'blast' : 'hit');
    await this.wait(type === 'R' ? 450 : 300);
    await this._travel(mover, from, to, styleOf(type));
    await k;
  }

  async _animateMove(st) {
    const rec = st.lastMove;
    const mover = this.pieces.get(rec.from);
    if (!mover || mover.code !== rec.piece) throw new Error('board mismatch');
    const victimSq = rec.flag === 'ep' ? (rec.from & 56) | (rec.to & 7) : rec.to;
    const victim = rec.captured ? this.pieces.get(victimSq) : null;
    if (rec.captured && !victim) throw new Error('victim missing');

    // 논리 위치를 먼저 갱신 (클릭 판정용)
    this.pieces.delete(rec.from);
    if (victim) { this.pieces.delete(victimSq); victim.group.userData.dying = true; }
    this.pieces.set(rec.to, mover);
    mover.group.userData.sq = rec.to;
    let rook = null, rookFrom = -1, rookTo = -1;
    if (rec.flag === 'castleK' || rec.flag === 'castleQ') {
      rookFrom = rec.flag === 'castleK' ? rec.from + 3 : rec.from - 4;
      rookTo = rec.flag === 'castleK' ? rec.from + 1 : rec.from - 1;
      rook = this.pieces.get(rookFrom);
      if (rook) {
        this.pieces.delete(rookFrom);
        this.pieces.set(rookTo, rook);
        rook.group.userData.sq = rookTo;
      }
    }

    const from = sqPos(rec.from), to = sqPos(rec.to);
    const vpos = victim ? sqPos(victimSq) : null;
    const type = mover.type;
    await this._turnTo(mover, angleTo(from, vpos || to));

    if (victim) {
      if (this.theme === 'classic') await this._classicAttack(mover, victim, from, vpos, to);
      else await this._modernAttack(mover, victim, from, vpos, to);
    } else if (rook) {
      const rf = sqPos(rookFrom), rt = sqPos(rookTo);
      await Promise.all([
        this._travel(mover, from, to, 'march'),
        (async () => {
          await this._turnTo(rook, angleTo(rf, rt));
          await this._travel(rook, rf, rt, 'tank');
          await this._turnTo(rook, homeAngle(rook.color));
        })(),
      ]);
    } else {
      await this._travel(mover, from, to, styleOf(type));
    }
    await this._turnTo(mover, homeAngle(mover.color));

    if (rec.promo) await this._promote(rec.to, mover, rec.promo);
    if (rec.san && rec.san.endsWith('+')) snd('check');
  }

  async _promote(sq, mover, promo) {
    const code = mover.color === 'w' ? promo.toUpperCase() : promo;
    const pos = sqPos(sq);
    snd('promote');
    this._sparkle(pos.clone().setY(0.3));
    this._pulseLight(pos.clone().setY(0.8), 8, 700);
    const g = mover.group;
    await this.tween(260, (e) => g.scale.setScalar(Math.max(0.001, 1 - e)));
    this._remove(mover);
    const np = this._createPiece(code);
    this._place(np, sq);
    np.group.scale.setScalar(0.001);
    await this.tween(450, (e) => np.group.scale.setScalar(Math.max(0.001, e)), backOut);
  }

  /** 체크메이트 / 기권 / 시간패 / 탈주: 진 쪽 장군이 백기를 들고 쓰러짐 */
  async _ending(result) {
    if (!result.winner || !['checkmate', 'resign', 'timeout', 'abandon'].includes(result.type)) return;
    const loser = result.winner === 'w' ? 'b' : 'w';
    const king = [...this.pieces.values()].find((p) => p.type === 'K' && p.color === loser);
    if (!king) return;
    await this.wait(250);
    snd('fanfare');
    if (this.theme === 'classic') return this._endingClassic(king);
    const arm = king.parts.soldier.arms.l;
    const flag = new THREE.Group();
    flag.position.y = -0.235;
    mesh(cyl(0.01, 0.01, 0.42, 8), king.mats.silver, 0, -0.2, 0, flag);
    const cloth = mesh(box(0.006, 0.13, 0.2), king.mats.flag, 0, -0.34, 0.1, flag);
    flag.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    flag.scale.setScalar(0.001);
    arm.add(flag);
    await Promise.all([
      this._armTo(arm, -3.0, 420),
      this.tween(420, (e) => flag.scale.setScalar(Math.max(0.001, e)), backOut),
    ]);
    await this.tween(1000, (e, t) => { cloth.rotation.y = Math.sin(t * Math.PI * 6) * 0.45; }, linear);
    snd('fall');
    const g = king.group;
    await this.tween(650, (e) => { g.rotation.x = -1.45 * e; }, easeIn);
    await this.tween(220, (e, t) => { g.rotation.x = -1.45 + Math.sin(Math.PI * t) * 0.12; }, linear);
  }

  /** 고전: 왕관이 떨어지고 → 왕이 무릎 꿇고 → 쓰러짐 */
  async _endingClassic(king) {
    const P = king.parts, s = P.soldier, g = king.group;
    const crown = P.crown;
    if (crown) {
      this.pieceGroup.attach(crown);   // 왕과 분리해서 바닥에 남김
      const c0 = crown.position.clone();
      const side = new THREE.Vector3(0.32, 0, 0.18).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
      snd('ting');
      await this.tween(650, (e, t) => {
        crown.position.set(c0.x + side.x * t, lerp(c0.y, 0.03, easeIn(t)) + 0.18 * Math.sin(Math.PI * t), c0.z + side.z * t);
        crown.rotation.x = t * 1.7;
        crown.rotation.z = t * 0.9;
      }, linear);
      await this.tween(200, (e, t) => { crown.position.y = 0.03 + 0.05 * Math.sin(Math.PI * t); }, linear);
    }
    // 무릎 꿇기
    snd('clank');
    const y0 = s.root.position.y, k = s.root.scale.x;
    await this.tween(500, (e) => {
      s.legs[0].rotation.x = -1.45 * e;
      s.legs[1].rotation.x = -0.35 * e;
      s.root.position.y = y0 - 0.17 * k * e;
      s.root.rotation.x = 0.25 * e;
      s.arms.r.rotation.x = lerp(-0.45, -0.1, e);
    });
    await this.wait(600);
    // 앞으로 쓰러짐
    snd('fall');
    snd('clank');
    await this.tween(650, (e) => { g.rotation.x = 1.4 * e; }, easeIn);
    await this.tween(220, (e, t) => { g.rotation.x = 1.4 - Math.sin(Math.PI * t) * 0.12; }, linear);
  }
}

const view = new Board3DView();
window.Board3D = view;
window.dispatchEvent(new Event('board3d-ready'));
