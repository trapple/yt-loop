/**
 * ページの側 (main world) で YouTube 自身のシークを呼ぶ橋。
 *
 * `movie_player.seekTo` は YouTube のプレイヤーが要素に足したメソッドで、ページの JavaScript からしか見えない。
 * `video.currentTime` を直接書き換えると YouTube の思っている位置とずれ、読み込み中のまま止まることがある
 * (docs/development.md「実装上の注意 (シーク)」)。**この world では chrome.* を使えない** ので、DOM のイベントだけで受ける
 */

/*
 * content script との取り決め。**youtube.ts にも同じ値を書いてある (変えるときは両方)。** 共有のモジュールに
 * 切り出すと、ビルド (crxjs) が両方を非同期のローダー経由で読み込む形に変え、main world では読み込みに失敗し、
 * youtube.ts は YouTube がクエリを消すより後に動きうる。食い違いは tests/content/seek-bridge.test.ts が見る
 */
/** document に投げるイベントの名前。detail はシーク先の秒数 (数値) */
const SEEK_EVENT = "yt-loop:seek";
/** 橋が動いている印。documentElement に立てる */
const BRIDGE_READY_ATTR = "data-yt-loop-seek-bridge";

type YouTubePlayer = HTMLElement & {
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
};

document.addEventListener(SEEK_EVENT, (event) => {
  const sec = (event as CustomEvent<unknown>).detail;
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return;
  const player = document.getElementById("movie_player") as YouTubePlayer | null;
  if (typeof player?.seekTo === "function") {
    // allowSeekAhead: まだ読み込んでいない位置でも YouTube に読み込ませる
    player.seekTo(sec, true);
    return;
  }
  // プレイヤーの API が見えない (YouTube の作りが変わった)。最後の手段として直接動かす
  const video = document.querySelector<HTMLVideoElement>("video.html5-main-video");
  if (video !== null) video.currentTime = sec;
});

document.documentElement.setAttribute(BRIDGE_READY_ATTR, "");
