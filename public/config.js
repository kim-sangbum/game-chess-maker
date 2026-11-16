/*
 * 배포 설정
 * - 로컬(npm start)이나 Render처럼 게임 서버가 함께 있는 곳에서는 그대로 두면 됩니다.
 * - GitHub Pages 빌드(scripts/build-pages.mjs)는 이 파일을 자동으로 덮어씁니다.
 */
window.CHESS_CONFIG = {
  onlineServer: '',   // 온라인 대전 서버 주소 (예: https://game-chess-maker.onrender.com). 비우면 지금 접속한 서버
  staticSite: false,  // true = 이 사이트에는 게임 서버가 없음 (GitHub Pages)
};
