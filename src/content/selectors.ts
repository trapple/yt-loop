/**
 * DOM セレクタの集約。
 * YouTube の画面構成が変わったとき、修正箇所をこの 1 ファイルに閉じ込める。
 */
export const YT_SELECTORS = {
  video: "video.html5-main-video",
  player: "#movie_player",
  /** 広告の再生中にプレイヤーに付くクラス。この間はループを止める */
  adShowing: "ad-showing",
  /** 範囲を帯で重ねる対象。プレイヤーのシークバー */
  progressBar: ".ytp-progress-bar",
  /** プレイヤーの右クリックメニュー。最初の右クリックで作られる */
  contextMenu: ".ytp-popup.ytp-contextmenu",
  /** 標準「ループ再生」。唯一のチェック付き項目で、項目はこの直後に差す */
  loopMenuItem: '.ytp-menuitem[role="menuitemcheckbox"]',
} as const;
