import { createContextMenu } from "@/content/context-menu";
import { createProgressBand } from "@/content/progress-band";
import { YT_SELECTORS } from "@/content/selectors";
import {
  EMPTY_LOOP,
  becameComplete,
  completeRange,
  setEnd,
  setStart,
  shouldJumpBack,
  type LoopState,
} from "@/shared/loop";
import { loadLoop, saveLoop } from "@/shared/storage";

/** 動画ページなら動画 ID (URL を見分ける鍵)。それ以外 (ホーム・検索・ショート) は null */
function currentVideoId(): string | null {
  if (location.pathname !== "/watch") return null;
  return new URLSearchParams(location.search).get("v");
}

function mainVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(YT_SELECTORS.video);
}

/** 広告の再生中か。この間の video は広告なので、位置を見ても触ってもいけない */
function isAdShowing(): boolean {
  const player = document.querySelector(YT_SELECTORS.player);
  return player?.classList.contains(YT_SELECTORS.adShowing) ?? false;
}

/** 動画の長さ。まだ読めていなければ Infinity (頭打ちしない) */
function durationSec(): number {
  const d = mainVideo()?.duration;
  return d !== undefined && Number.isFinite(d) && d > 0 ? d : Infinity;
}

/** 今の状態が属する動画。読み込みが終わるまでは null (編集を受け付けない) */
let videoId: string | null = null;
let state: LoopState = { ...EMPTY_LOOP };
/** 読み込みの世代。読んでいる途中で別の動画へ移ったら、遅れて届いた古い動画の状態を捨てる */
let loadToken = 0;
/**
 * video.loop を状態へ写し始めてよいか。動画が変わった直後は偽。
 * YouTube は新しい動画を読み込むときに video.loop を戻しうるので、覚えていたオンを
 * 読み込み中の false で上書き保存しないよう、最初に再生が始まるまで待つ (onMediaEvent の playing)
 */
let loopSyncArmed = false;

const menu = createContextMenu({
  currentSec() {
    const video = mainVideo();
    if (videoId === null || video === null || isAdShowing()) return null;
    return video.currentTime;
  },
  state: () => state,
  onSetStart(sec) {
    apply(setStart(state, sec, durationSec()));
  },
  onSetEnd(sec) {
    const next = setEnd(state, sec, durationSec());
    // メニューは置けない位置では押せなくしてある。届いたら表示と判定がずれている
    if (next === null) throw new Error(`[yt-loop] B を置けない位置です: ${sec}`);
    apply(next);
  },
  onClear() {
    apply({ ...EMPTY_LOOP });
  },
});

const band = createProgressBand();

/**
 * 範囲の編集を反映する。範囲が初めてそろったら標準「ループ再生」をオンにする (README「できること」)。
 * そろっていない間の video.loop には触らない (範囲が無いときの「ループ再生」は YouTube 標準のまま)
 */
function apply(next: LoopState): void {
  const video = mainVideo();
  if (becameComplete(state, next) && video !== null) video.loop = true;
  const enabled = completeRange(next) !== null && (video?.loop ?? false);
  commit({ ...next, enabled });
}

/** 状態を差し替えて、描き直し・保存・見張りの張り直しをまとめて行う。**状態を変える経路はここを通す** */
function commit(next: LoopState): void {
  if (videoId === null) return;
  state = next;
  render();
  syncWatch();
  saveLoop(videoId, state).catch((error: unknown) => {
    console.warn("[yt-loop] 範囲を保存できませんでした", error);
  });
}

function render(): void {
  band.refresh(
    currentVideoId() === null ? null : document.querySelector(YT_SELECTORS.progressBar),
    state,
    mainVideo()?.duration ?? NaN,
  );
}

// ---- ループの見張り ----

/**
 * 標準「ループ再生」の切り替えを状態へ写す。切り替えの通知は無いので、見張りのたびに見比べる。
 * 範囲がそろっている間だけ (そろっていないときのオン / オフは動画全体のループで、覚える対象ではない)
 */
function syncEnabled(video: HTMLVideoElement): void {
  if (!loopSyncArmed || completeRange(state) === null) return;
  if (video.loop !== state.enabled) commit({ ...state, enabled: video.loop });
}

/** B を過ぎていたら A へ戻す */
function checkLoop(): void {
  const video = mainVideo();
  if (video === null || isAdShowing() || state.startSec === null) return;
  syncEnabled(video);
  if (shouldJumpBack(state, video.currentTime, video.duration)) {
    video.currentTime = state.startSec;
  }
}

let frame = 0;

/**
 * 毎フレーム見る。timeupdate は約 250ms 間隔なので、それだけだと B を過ぎてから戻るまでに
 * 音が漏れる。rAF は背景タブでは止まるので、そちらは timeupdate (onMediaEvent) が拾う
 */
function step(): void {
  frame = requestAnimationFrame(step);
  checkLoop();
}

/**
 * 範囲がそろっていて動画ページにいる間だけ rAF を回す。オン / オフでは止めない:
 * 標準「ループ再生」の切り替えを写すのもこの見張り (止めた動画では timeupdate が来ない)
 */
function syncWatch(): void {
  const active = completeRange(state) !== null && currentVideoId() !== null;
  if (active && frame === 0) {
    frame = requestAnimationFrame(step);
  } else if (!active && frame !== 0) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/** メディアのイベントは泡立たないので、document で**捕捉側**に張る。video が差し替わっても張り直さずに済む */
function onMediaEvent(event: Event): void {
  const video = mainVideo();
  if (event.target !== video || video === null) return;
  switch (event.type) {
    case "timeupdate":
      checkLoop();
      break;
    case "playing":
      if (!loopSyncArmed && videoId !== null && !isAdShowing()) {
        // 読み込み中に YouTube が戻した分を、覚えていた値で上書きしてから写し始める
        if (completeRange(state) !== null) video.loop = state.enabled;
        loopSyncArmed = true;
      }
      break;
    default:
      // 長さが分かった / 変わった。帯の位置は長さで決まる
      render();
  }
}

function onContextMenu(event: MouseEvent): void {
  if (currentVideoId() === null) return;
  const player = document.querySelector(YT_SELECTORS.player);
  if (player === null || !(event.target instanceof Node) || !player.contains(event.target)) return;
  menu.onContextMenu();
}

// ---- SPA 遷移と再描画への追従 ----

/** 動画が変わったら、その URL で覚えた状態を読み、覚えていたオン / オフを戻す */
function onVideoChanged(nextId: string | null): void {
  videoId = null;
  state = { ...EMPTY_LOOP };
  loopSyncArmed = false;
  syncWatch();
  render();
  if (nextId === null) return;

  const token = ++loadToken;
  loadLoop(nextId)
    .then((loaded) => {
      if (token !== loadToken) return;
      videoId = nextId;
      state = loaded;
      // 覚えていなければ「ループ再生」には触らない (README「動作の決まり」)
      const video = mainVideo();
      if (completeRange(loaded) !== null && video !== null) video.loop = loaded.enabled;
      // もう再生中なら playing は来ない。ここで写し始める
      if (video !== null && !video.paused) loopSyncArmed = true;
      render();
      syncWatch();
    })
    .catch((error: unknown) => {
      if (token !== loadToken) return;
      console.warn("[yt-loop] 範囲を読めませんでした", error);
      // 読めなくても空の状態で使えるようにする
      videoId = nextId;
      loopSyncArmed = true;
    });
}

let lastVideoId: string | null = null;
let mutationFrame = 0;

/** DOM の変化はまとめて 1 フレームに 1 回だけ見る (YouTube は変化がとても多い) */
function onPageMutated(): void {
  if (mutationFrame !== 0) return;
  mutationFrame = requestAnimationFrame(() => {
    mutationFrame = 0;
    const id = currentVideoId();
    if (id !== lastVideoId) {
      lastVideoId = id;
      onVideoChanged(id);
    }
    // シークバーが作り直されていたら帯も差し直す
    if (id !== null) render();
  });
}

function start(): void {
  lastVideoId = currentVideoId();
  onVideoChanged(lastVideoId);
  new MutationObserver(onPageMutated).observe(document.body, { childList: true, subtree: true });
  // yt-navigate-finish は YouTube 自身が SPA 遷移の終わりに出す。DOM の変化を待たずに追従できる
  document.addEventListener("yt-navigate-finish", onPageMutated);
  for (const type of ["timeupdate", "playing", "loadedmetadata", "durationchange"]) {
    document.addEventListener(type, onMediaEvent, true);
  }
  document.addEventListener("contextmenu", onContextMenu, true);
}

start();
