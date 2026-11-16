/* 효과음 — Web Audio로 직접 합성합니다 (외부 파일 없음). window.Sound */
(function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('chess.muted') === '1'; } catch { /* 무시 */ }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise({ t = 0, dur = 0.2, vol = 0.5, type = 'lowpass', freq = 1000, freqEnd, q = 1 }) {
    const c = muted ? null : ac();
    if (!c) return;
    const now = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, now);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f).connect(g).connect(master);
    src.start(now, Math.random() * 0.5);
    src.stop(now + dur + 0.05);
  }

  function tone({ t = 0, dur = 0.2, vol = 0.3, freq = 440, freqEnd, type = 'sine', attack = 0.005 }) {
    const c = muted ? null : ac();
    if (!c) return;
    const now = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  const Sound = {
    // 2D 보드용 기본음
    move() { noise({ dur: 0.07, vol: 0.6, type: 'bandpass', freq: 900, q: 4 }); },
    capture() {
      noise({ dur: 0.07, vol: 0.6, type: 'bandpass', freq: 900, q: 4 });
      noise({ t: 0.07, dur: 0.09, vol: 0.5, type: 'bandpass', freq: 600, q: 3 });
    },
    // 공격
    shot() {
      noise({ dur: 0.2, vol: 0.9, type: 'bandpass', freq: 1800, freqEnd: 300, q: 0.7 });
      tone({ dur: 0.08, freq: 160, freqEnd: 50, type: 'square', vol: 0.2 });
    },
    sniper() {
      noise({ dur: 0.45, vol: 1, type: 'highpass', freq: 2600, freqEnd: 500 });
      tone({ dur: 0.35, freq: 1500, freqEnd: 250, type: 'sawtooth', vol: 0.07 });
      noise({ t: 0.05, dur: 0.6, vol: 0.25, type: 'lowpass', freq: 600, freqEnd: 100 });
    },
    pistol() {
      noise({ dur: 0.12, vol: 0.75, type: 'bandpass', freq: 2600, q: 1 });
      tone({ dur: 0.05, freq: 300, freqEnd: 90, type: 'square', vol: 0.12 });
    },
    cannon() {
      noise({ dur: 0.8, vol: 1, type: 'lowpass', freq: 1000, freqEnd: 70 });
      tone({ dur: 0.6, freq: 95, freqEnd: 32, vol: 0.7 });
    },
    explosion() {
      noise({ dur: 1.1, vol: 1, type: 'lowpass', freq: 1600, freqEnd: 50 });
      tone({ dur: 0.9, freq: 65, freqEnd: 25, vol: 0.6 });
      noise({ t: 0.15, dur: 0.5, vol: 0.3, type: 'bandpass', freq: 3000, q: 0.5 });
    },
    clash() {
      tone({ dur: 0.45, freq: 2400, type: 'triangle', vol: 0.2 });
      tone({ dur: 0.4, freq: 3170, type: 'triangle', vol: 0.12 });
      noise({ dur: 0.08, vol: 0.45, type: 'highpass', freq: 4000 });
    },
    bonk() {
      tone({ dur: 0.16, freq: 440, freqEnd: 170, vol: 0.6 });
      noise({ dur: 0.05, vol: 0.35, type: 'bandpass', freq: 1200, q: 2 });
    },
    // 장난감이 쓰러지며 달그락
    fall() {
      tone({ dur: 0.12, freq: 230, freqEnd: 90, type: 'triangle', vol: 0.3 });
      noise({ t: 0.32, dur: 0.07, vol: 0.4, type: 'bandpass', freq: 1300, q: 4 });
      noise({ t: 0.46, dur: 0.05, vol: 0.25, type: 'bandpass', freq: 1600, q: 4 });
      noise({ t: 0.55, dur: 0.04, vol: 0.15, type: 'bandpass', freq: 1800, q: 4 });
    },
    // 이동
    step(n = 3, interval = 0.16) {
      for (let i = 0; i < n; i++) noise({ t: i * interval, dur: 0.05, vol: 0.28, type: 'bandpass', freq: 650 + (i % 2) * 120, q: 3 });
    },
    gallop(n = 4) {
      for (let i = 0; i < n; i++) {
        noise({ t: i * 0.15, dur: 0.05, vol: 0.45, type: 'bandpass', freq: 480, q: 2 });
        noise({ t: i * 0.15 + 0.055, dur: 0.05, vol: 0.35, type: 'bandpass', freq: 560, q: 2 });
      }
    },
    roll(sec = 0.8) {
      noise({ dur: sec, vol: 0.35, type: 'lowpass', freq: 320 });
      tone({ dur: sec, freq: 52, type: 'sawtooth', vol: 0.06 });
    },
    // ---- 고전 전투 ----
    whoosh() { noise({ dur: 0.22, vol: 0.45, type: 'bandpass', freq: 700, freqEnd: 2400, q: 1.2 }); },
    thrust() { noise({ dur: 0.14, vol: 0.5, type: 'bandpass', freq: 1200, freqEnd: 400, q: 1.5 }); },
    thunk() {
      tone({ dur: 0.12, freq: 200, freqEnd: 90, type: 'triangle', vol: 0.45 });
      noise({ dur: 0.06, vol: 0.4, type: 'bandpass', freq: 800, q: 3 });
    },
    twang() {
      tone({ dur: 0.35, freq: 190, freqEnd: 150, type: 'triangle', vol: 0.35, attack: 0.002 });
      tone({ dur: 0.2, freq: 380, freqEnd: 300, type: 'sine', vol: 0.12, attack: 0.002 });
      noise({ t: 0.03, dur: 0.3, vol: 0.25, type: 'bandpass', freq: 1500, freqEnd: 3500, q: 2 });
    },
    lance() {
      noise({ dur: 0.35, vol: 0.9, type: 'lowpass', freq: 1800, freqEnd: 200 });
      tone({ dur: 0.3, freq: 1900, type: 'triangle', vol: 0.12 });
      noise({ t: 0.08, dur: 0.1, vol: 0.4, type: 'bandpass', freq: 600, q: 2 });
    },
    creak() {
      tone({ dur: 0.35, freq: 110, freqEnd: 150, type: 'sawtooth', vol: 0.08 });
      noise({ dur: 0.35, vol: 0.12, type: 'bandpass', freq: 400, q: 6 });
    },
    catapult() {
      noise({ dur: 0.18, vol: 0.6, type: 'lowpass', freq: 500 });
      tone({ dur: 0.15, freq: 120, freqEnd: 60, vol: 0.4 });
      noise({ t: 0.1, dur: 0.5, vol: 0.3, type: 'bandpass', freq: 500, freqEnd: 1600, q: 1 });
    },
    impact() {
      noise({ dur: 0.7, vol: 1, type: 'lowpass', freq: 1200, freqEnd: 80 });
      tone({ dur: 0.4, freq: 80, freqEnd: 35, vol: 0.5 });
      for (let i = 0; i < 5; i++) noise({ t: 0.12 + i * 0.07, dur: 0.04, vol: 0.25, type: 'bandpass', freq: 1500 + i * 300, q: 4 });
    },
    clank() {
      [1180, 1730, 2390].forEach((f, i) => tone({ dur: 0.18 - i * 0.03, freq: f, type: 'triangle', vol: 0.1 }));
      noise({ dur: 0.05, vol: 0.25, type: 'highpass', freq: 3000 });
    },
    ting() {
      tone({ dur: 0.9, freq: 2093, type: 'sine', vol: 0.18 });
      tone({ dur: 0.7, freq: 3140, type: 'sine', vol: 0.08 });
      tone({ t: 0.35, dur: 0.5, freq: 2093, type: 'sine', vol: 0.08 });
    },
    armorStep(n = 3, interval = 0.16) {
      for (let i = 0; i < n; i++) {
        noise({ t: i * interval, dur: 0.05, vol: 0.25, type: 'bandpass', freq: 600 + (i % 2) * 120, q: 3 });
        tone({ t: i * interval, dur: 0.06, freq: 2200 + (i % 2) * 300, type: 'triangle', vol: 0.03 });
      }
    },
    // 특수
    check() {
      tone({ dur: 0.14, freq: 880, type: 'square', vol: 0.1 });
      tone({ t: 0.17, dur: 0.2, freq: 880, type: 'square', vol: 0.1 });
    },
    promote() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ t: i * 0.09, dur: 0.3, freq: f, type: 'triangle', vol: 0.18 }));
    },
    fanfare() {
      [[392, 0, 0.18], [523, 0.18, 0.18], [659, 0.36, 0.18], [784, 0.54, 0.5]].forEach(([f, t, d]) => {
        tone({ t, dur: d, freq: f, type: 'sawtooth', vol: 0.09 });
        tone({ t, dur: d, freq: f * 2, type: 'triangle', vol: 0.05 });
      });
    },
    isMuted() { return muted; },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem('chess.muted', muted ? '1' : '0'); } catch { /* 무시 */ }
    },
  };

  // 브라우저 정책상 첫 클릭 이후에 소리를 켤 수 있음
  document.addEventListener('pointerdown', () => { if (!muted) ac(); }, { once: true });
  window.Sound = Sound;
})();
