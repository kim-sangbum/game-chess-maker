/*
 * GitHub Pages용 정적 사이트 빌드 → _site/
 *
 * 로컬/Render에서는 server.js가 /vendor/... 를 node_modules에서 직접 제공하지만,
 * Pages에는 서버가 없으므로 필요한 라이브러리·글꼴 파일만 골라 _site/vendor/ 에 복사합니다.
 *
 *   ONLINE_SERVER_URL=https://<render 주소> npm run build:pages
 *   (비워 두면 온라인 대전 메뉴에서 "서버가 연결되지 않음" 안내가 나옵니다)
 */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const NM = path.join(ROOT, 'node_modules');
// server.js의 VENDOR 경로와 같은 대응
const VENDOR = {
  'three/': path.join(NM, 'three'),
  'fontsource/': path.join(NM, '@fontsource'),
  'pretendard/': path.join(NM, 'pretendard', 'dist', 'web'),
};
const vendorSrc = (rel) => {
  for (const [prefix, dir] of Object.entries(VENDOR)) if (rel.startsWith(prefix)) return path.join(dir, rel.slice(prefix.length));
  throw new Error('알 수 없는 vendor 경로: ' + rel);
};
let copied = 0;
const copyVendor = (rel) => {
  const src = vendorSrc(rel);
  if (!existsSync(src)) throw new Error('파일 없음: ' + src);
  const dst = path.join(OUT, 'vendor', rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(src, dst);
  copied++;
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) 게임 파일
cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

// 2) Three.js (board3d.js가 쓰는 파일만) + 라이선스
for (const f of ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js', 'LICENSE']) copyVendor('three/' + f);

// 3) 글꼴: index.html이 불러오는 CSS와, 그 CSS가 참조하는 글꼴 파일 + 라이선스
const html = readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const fontCss = [...html.matchAll(/href="vendor\/([^"]+\.css)"/g)].map((m) => m[1]);
if (!fontCss.length) throw new Error('index.html에서 글꼴 CSS를 찾지 못했습니다');
for (const rel of fontCss) {
  copyVendor(rel);
  const css = readFileSync(vendorSrc(rel), 'utf8');
  const dir = path.posix.dirname(rel);
  for (const [, u] of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (/^(data:|https?:)/.test(u)) continue;
    copyVendor(path.posix.normalize(path.posix.join(dir, u)));
  }
  if (rel.startsWith('fontsource/')) {
    const pkg = rel.split('/')[1];
    const lic = `fontsource/${pkg}/LICENSE`;
    if (existsSync(vendorSrc(lic)) && !existsSync(path.join(OUT, 'vendor', lic))) copyVendor(lic);
  }
}

// 4) 소개 페이지 (캡처 도구는 제외)
cpSync(path.join(ROOT, 'docs'), path.join(OUT, 'docs'), {
  recursive: true,
  filter: (src) => !src.includes(`${path.sep}tools`),
});

// 5) 배포 설정: Pages에는 게임 서버가 없음 → 온라인 대전은 외부 서버(Render) 사용
const online = (process.env.ONLINE_SERVER_URL || '').trim().replace(/\/+$/, '');
writeFileSync(path.join(OUT, 'config.js'),
  `/* GitHub Pages 빌드에서 자동 생성 (scripts/build-pages.mjs) */\nwindow.CHESS_CONFIG = ${JSON.stringify({ onlineServer: online, staticSite: true }, null, 2)};\n`);

// 6) Jekyll 처리 끄기 (밑줄로 시작하는 파일 등을 그대로 제공)
writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`_site 빌드 완료 — vendor 파일 ${copied}개, 온라인 서버: ${online || '(없음)'}`);
