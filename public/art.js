/* 2D 기물 SVG와 UI 아이콘 (직접 그린 그림) — window.Art */
(function () {
  'use strict';

  // ---------- 기물 (viewBox 0 0 45 45) ----------
  const BASE = '<path d="M10.5 35h24a1.5 1.5 0 0 1 1.5 1.5V39.5H9v-3A1.5 1.5 0 0 1 10.5 35z"/>';
  const PIECES = {
    P: `<circle cx="22.5" cy="13.5" r="5"/>
        <path d="M18.3 19h8.4l-1.4 3h-5.6z"/>
        <path d="M19.8 22c-.3 5.5-3 9-5.3 13h16c-2.3-4-5-7.5-5.3-13z"/>${BASE}`,
    R: `<path d="M11.5 8h5v4h3.5V8h5v4h3.5V8h5v8l-3 3v11l3 5h-22l3-5V19l-3-3z"/>
        <path class="d" d="M14.5 19h16M14.5 30h16"/>${BASE}`,
    B: `<circle cx="22.5" cy="8" r="2.6"/>
        <path d="M22.5 10.6c-5.6 3.7-7.8 8.6-6.3 13 1 2.8 2.8 4.4 2.8 4.4h7s1.8-1.6 2.8-4.4c1.5-4.4-.7-9.3-6.3-13z"/>
        <path class="d" d="M25 15.5l-4.5 5.5"/>
        <path d="M18.5 28h8l1 2.6h-10z"/>
        <path d="M17.6 30.6h9.8l4 4.4h-17.8z"/>${BASE}`,
    N: `<path d="M14 35c0-6.5 3.5-9.5 6.5-12.5-3 .8-5.8 1.6-8 .6-2.3-1-2.6-3.8-.8-6.1 2.2-2.9 5.2-5.3 7.3-8.5l1-3 2 3.3c6.2.3 11 5.5 11 13.7 0 5.5-1.8 9.2-2 12.5z"/>
        <circle class="e" cx="18.4" cy="14.6" r="1.1"/>
        <path class="d" d="M24.5 11.5c3.6 2.8 5.5 7.6 5.3 14.5"/>${BASE}`,
    Q: `<circle cx="9.5" cy="12" r="2.1"/><circle cx="16" cy="8.8" r="2.1"/><circle cx="22.5" cy="7.6" r="2.1"/>
        <circle cx="29" cy="8.8" r="2.1"/><circle cx="35.5" cy="12" r="2.1"/>
        <path d="M10 14l4 14h17l4-14-5 9-1.2-11.5-4.3 10.3-2-11-2 11-4.3-10.3L15 23z"/>
        <path d="M14 28h17l1 3H13z"/>
        <path d="M13.5 31h18l2.5 4h-23z"/>${BASE}`,
    K: `<path d="M21.2 2.5h2.6v3h3v2.6h-3v3.4h-2.6V8.1h-3V5.5h3z"/>
        <path d="M22.5 12c-8.5 0-13.6 5-11.6 10.3 1 2.7 3.1 4.6 3.1 5.7h17c0-1.1 2.1-3 3.1-5.7C36.1 17 31 12 22.5 12z"/>
        <path class="d" d="M22.5 12v7"/>
        <path d="M14 28h17l1 3H13z"/>
        <path d="M13.5 31h18l2.5 4h-23z"/>${BASE}`,
  };

  function piece(code, extraClass = '') {
    const c = code === code.toUpperCase() ? 'w' : 'b';
    return `<svg class="pc pc-${c} ${extraClass}" viewBox="0 0 45 45" aria-hidden="true">${PIECES[code.toUpperCase()]}</svg>`;
  }

  // ---------- 아이콘 (viewBox 0 0 24 24, 선) ----------
  const ICONS = {
    robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.1" class="f"/><circle cx="14.5" cy="13" r="1.1" class="f"/><path d="M9.5 16.3h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.2 3 14.8 0 18-3-3.2-3-14.8 0-18z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.4 3-5 5.5-5s4.7 1.6 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.4-.3 4.3 1.1 5 4.3"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    flip: '<path d="M7 4v16"/><path d="M4 7l3-3 3 3"/><path d="M17 20V4"/><path d="M14 17l3 3 3-3"/>',
    restart: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    scale: '<path d="M12 4v16"/><path d="M8 20h8"/><path d="M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/><path d="M19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
    leave: '<path d="M14 4H6v16h8"/><path d="M10 12h10"/><path d="M17 9l3 3-3 3"/>',
    enter: '<path d="M10 4h8v16h-8"/><path d="M3 12h10"/><path d="M10 9l3 3-3 3"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h16M12 4v16"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v4M16 5v4M8 15v4M16 15v4"/>',
    focus: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><circle cx="12" cy="12" r="3"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    swords: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5"/><path d="M11 19l-6-6"/><path d="M8 16l-4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    crown: '<path d="M4 18h16"/><path d="M5 15l-1.5-8 5 3.5L12 5l3.5 5.5 5-3.5L19 15z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };

  function icon(name, cls = '') {
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  window.Art = { piece, icon };
})();
