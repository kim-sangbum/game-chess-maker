# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working with this user

- The user writes in Korean; respond in Korean. UI text, comments, and docs are Korean.
- **For new feature/design requests, do not start coding immediately.** First list the decisions to be made as numbered questions with options and a marked recommendation, then summarize the agreed plan. Implement only after the user says "반영해줘"/"반영해 줘". ("추천대로" = take all recommended options.) Small fixes the user explicitly asks to apply can proceed directly.

## Commands

```bash
npm install          # deps: ws, three, font packages (@fontsource/*, pretendard)
npm start            # node server.js → http://localhost:3100 (PORT env overrides; 3000 is taken by another project)
```

- The game must be opened through the server, not `file://`: the AI Web Worker, the Three.js import map, and fonts are all served by `server.js` (`/vendor/three/`, `/vendor/fontsource/`, `/vendor/pretendard/` → `node_modules`).
- Deployment is split: a static build goes to **GitHub Pages**, and the WebSocket server (`server.js`) goes to **Render**.
  - `npm run build:pages` (`scripts/build-pages.mjs`) assembles `_site/` by copying `public/` and `docs/`, plus only the needed vendor files (Three.js module + OrbitControls, the font CSS referenced in `index.html` and the files their `url()`s point to).
  - The build also writes `config.js` with `{ onlineServer: $ONLINE_SERVER_URL, staticSite: true }`.
  - `.github/workflows/pages.yml` runs this on every push to `main`. `render.yaml` defines the Render service, with health check `/health`.
  - Keep all asset paths in `public/` relative (no leading `/`), because Pages serves the site under `/game-chess-maker/`. When adding a vendor file, add it to both `server.js` `VENDOR` and the build script.
  - `app.js` `connect()` reads `window.CHESS_CONFIG.onlineServer`. For a cross-origin server it first polls `<server>/health`, which sends CORS headers, to wake a sleeping Render free instance, then opens the WebSocket.
- After changing `server.js`, restart the server. Static files are served with `no-cache`, so a browser refresh is enough.
- There is no lint or test setup in the repo. Use `node --check <file>` for syntax (not for `board3d.js`, which is an ES module). The rules engine is CommonJS-loadable, so it can be checked directly in Node, e.g. perft:
  ```bash
  node -e "const C=require('./public/chess.js');const g=new C().loadFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');const p=(d)=>{if(!d)return 1;let n=0;for(const m of g.legalMoves()){g.makeMove(m);n+=p(d-1);g.unmakeMove(m)}return n};console.log(p(3))"   # expect 97862
  ```
- Documentation screenshots: `node docs/tools/capture-flow.mjs http://localhost:3100 docs/screenshots`. This drives installed Chrome headless over CDP using Node's built-in WebSocket; no Python or Playwright needed. The doc skill lives in `.claude/skills/dev-game-documentation/`.

## Architecture

**One rules engine, three runtimes.** `public/chess.js` is a UMD module that runs in:
- the page (`window.Chess`)
- the AI worker (`importScripts` in `public/ai.js`)
- the server (`require` in `server.js`)

Engine conventions:
- Board is a 64-entry array with index 0 = a8, 63 = h1 (`row = sq >> 3`, `file = sq & 7`). Uppercase = white, lowercase = black, `null` = empty.
- `move({from,to,promo})` is the validated public API. It records a SAN `rec` in `history`, updates the repetition `positions`, and sets `result`.
- `makeMove`/`unmakeMove` are unvalidated and used by search and legality checks.
- Selectable rules (`normalizeRules`) are applied inside the engine. The server always normalizes client-supplied rules.

**Online play is server-authoritative** (`server.js`):
- Rooms live in an in-memory `Map` with 4-char codes. Only the host can `startGame`.
- The server validates every move and owns the clocks (`settleClock`, a 200 ms timeout sweep).
- After each change it broadcasts `{type:'game', moves, gameNo, clocks, result, ...}`. Clients don't receive board state: they rebuild it with `Chess.fromMoves(rules, moves)`, after optimistically applying their own move.
- Leaving or disconnecting mid-game counts as `abandon`.
- Each player's battle theme (classic/modern) is purely client-side; the server never sees it.

**Client** (`public/app.js`, classic script):
- One global state object `S` holds everything. `show(screen)` switches `<section class="screen">` and sets `body[data-screen]` and `body[data-ui]`. `data-ui` (classic/modern) drives all CSS theming via variables in `style.css`.
- `renderGame()` → `renderBoard` / `renderBars` / `renderMoves` / `renderStatus` / `renderControls`.
- Local clocks (AI and hot-seat modes) are in `S.clocks`. Online clocks come from the server snapshot (`S.clockSnap`).
- `S.gameId` increments on every new game. The 3D view uses it to decide "new game → rebuild".

**3D view** (`public/board3d.js`, ES module loaded after `app.js`):
- Exposes the singleton `window.Board3D` and fires a `board3d-ready` event.
- `app.js` feeds it state through `Board3D.update({gameId, ply, board, lastMove, …})`. If `ply` advanced by exactly 1, the move is queued as an animation. Otherwise (undo, resync, new game, effects off) the pieces are rebuilt instantly from the board array.
- Animations are async functions over a tween system. `_cancelAll()` bumps `epoch`, which makes pending tweens reject with `Cancel`. Fire-and-forget effects are wrapped in `safe()`.
- `whenIdle()` lets the app delay the game-over modal until animations finish (`afterFx`).
- Themes: `BUILDERS[theme][type]` build the piece models, `_modernAttack`/`_classicAttack` dispatch attacks, and `_ending`/`_endingClassic` play end-of-game scenes. Each theme has its own environment group (`_buildModernEnv`/`_buildClassicEnv`).
- The same renderer is reused as the rotating home-screen background: `startShowcase(container)` / `stopShowcase()` / `attach(container)` move the canvas between `#home-3d` and `#board3d`.

**Other client modules**:
- `public/ai.js`: Web Worker running negamax alpha-beta with quiescence and iterative deepening under a per-level time budget. Levels 1–3 add root-score noise, so the root uses a full window there.
- `public/sound.js`: all sound effects synthesized with Web Audio (`window.Sound`).
- `public/art.js`: hand-drawn SVG pieces for 2D and UI icons (`window.Art.piece/icon`). Elements with `data-icon` are filled on init.

**Load order** in `index.html`: `art.js` → `sound.js` → `chess.js` → `app.js` → `board3d.js` (module, via an import map to `/vendor/three/`).
