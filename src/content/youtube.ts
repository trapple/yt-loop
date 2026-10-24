import { createContextMenu } from "@/content/context-menu";
import { createProgressBand } from "@/content/progress-band";
import { YT_SELECTORS } from "@/content/selectors";
import { showToast } from "@/content/toast";
import {
  EMPTY_LOOP,
  becameComplete,
  completeRange,
  isPastEnd,
  setEnd,
  setStart,
  shouldJumpBack,
  type CompleteRange,
  type LoopState,
} from "@/shared/loop";
import { buildShareUrl, readUrlLoop, type UrlLoop } from "@/shared/share-url";
import { loadLoop, saveLoop } from "@/shared/storage";

/*
 * main world の橋 (src/main-world/seek-bridge.ts) との取り決め。**橋にも同じ値を書いてある (変えるときは両方)。**
 * 共有のモジュールに切り出さない理由は橋の側のコメント。食い違いは tests/content/seek-bridge.test.ts が見る
 */
/** document に投げるイベントの名前。detail はシーク先の秒数 (数値) */
const SEEK_EVENT = "yt-loop:seek";
/** 橋が動いている印。橋が documentElement に立てる */
const BRIDGE_READY_ATTR = "data-yt-loop-seek-bridge";

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
/**
 * URL のクエリで指定された、まだ当てていない範囲 (README「URL でループを指定する」)。
 * YouTube は読み込みの途中でクエリを URL から消すので、見つけた時点 (起動時・リンクのクリック) で取っておき、
 * その動画の状態を読むときに当てる
 */
let pendingUrlLoop: UrlLoop | null = null;

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
    // メニューを開いている間も動画は進むので、押した時点でもう B を過ぎていることがある。
    // 「またいだら戻す」だけだと、このままループに入らずに流れていく (README「動作の決まり」)
    const video = mainVideo();
    if (video !== null && state.startSec !== null && isPastEnd(state, video.currentTime, video.duration)) {
      seekTo(state.startSec);
    }
  },
  onClear() {
    apply({ ...EMPTY_LOOP });
  },
  onShare,
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

/**
 * 前に見た再生位置。B をまたいだかを決めるのに使う。**シークのたびに null に戻す** (飛んだ先が B より後でも
 * 「またいだ」と取り違えないように。onMediaEvent の seeking と、checkLoop の video.seeking)
 */
let lastSec: number | null = null;

/**
 * YouTube 自身のシークで動かす。**`video.currentTime` を直接書き換えない:** YouTube のシークの最中に割り込むと
 * 読み込み中のまま止まる (README「実装上の注意 (シーク)」)。main world の橋が無いときだけ直接動かす
 */
function seekTo(sec: number): void {
  lastSec = null;
  if (document.documentElement.hasAttribute(BRIDGE_READY_ATTR)) {
    document.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: sec }));
    return;
  }
  const video = mainVideo();
  if (video !== null) video.currentTime = sec;
}

/** 再生が B をまたいだら A へ戻す */
function checkLoop(): void {
  const video = mainVideo();
  if (video === null || isAdShowing() || state.startSec === null) return;
  syncEnabled(video);
  // シークの最中。seeking のイベントより先にここへ来ることがあるので、フラグでも見る
  if (video.seeking) {
    lastSec = null;
    return;
  }
  const current = video.currentTime;
  if (shouldJumpBack(state, lastSec, current, video.duration)) {
    seekTo(state.startSec);
    return;
  }
  lastSec = current;
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
    case "seeking":
      // シークで飛んだ。飛んだ先から数え直す (B より後へ飛んだならループを抜ける)
      lastSec = null;
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
  menu.onContextMenu(event);
}

// ---- URL でのループの指定と共有 ----

/** URL で指定された範囲を当てる。共有された URL はループするためのものなので「ループ再生」もオンにする */
function applyUrlLoop(range: CompleteRange): void {
  const video = mainVideo();
  if (video !== null) video.loop = true;
  commit({ ...range, enabled: true });
}

/** その動画に向けて取っておいた範囲を取り出す。別の動画のものなら捨てる (後で同じ動画を開いたときに古い範囲を当てない) */
function takeUrlLoop(id: string): CompleteRange | null {
  const pending = pendingUrlLoop;
  pendingUrlLoop = null;
  return pending !== null && pending.videoId === id ? pending.range : null;
}

/**
 * YouTube の中のリンクを押した移動 (SPA 遷移) はページを読み込み直さないので、押したリンクの URL から範囲を読む。
 * 修飾キー付き・中ボタンは新しいタブで開く (そのタブが自分で URL を読む) ので見ない
 */
function onLinkClick(event: MouseEvent): void {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (link === null) return;
  const found = readUrlLoop(link.href);
  if (found === null) return;
  // 今見ている動画へのリンクなら動画は変わらない (onVideoChanged が走らない)。ここで当てる
  if (found.videoId === videoId) {
    applyUrlLoop(found.range);
    return;
  }
  pendingUrlLoop = found;
}

function onShare(): void {
  const range = completeRange(state);
  if (videoId === null || range === null) return;
  copyText(buildShareUrl(videoId, range)).then(
    () => showToast("ループの URL をコピーしました"),
    (error: unknown) => {
      console.warn("[yt-loop] URL をコピーできませんでした", error);
      showToast("URL をコピーできませんでした");
    },
  );
}

/**
 * クリップボードへ写す。navigator.clipboard は文書にフォーカスが無いと断られるので、そのときは
 * 選択してコピーする古い方法に倒す (YouTube 自身の「動画の URL をコピー」も同じ方法を持っている)
 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // 下の方法を試す
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("execCommand('copy') が失敗しました");
}

// ---- SPA 遷移と再描画への追従 ----

/** 動画が変わったら、その URL で覚えた状態を読み、覚えていたオン / オフを戻す */
function onVideoChanged(nextId: string | null): void {
  videoId = null;
  state = { ...EMPTY_LOOP };
  loopSyncArmed = false;
  lastSec = null;
  syncWatch();
  render();
  if (nextId === null) return;

  const token = ++loadToken;
  loadLoop(nextId)
    .then((loaded) => {
      if (token !== loadToken) return;
      videoId = nextId;
      // URL で指定されていれば、覚えていた範囲より優先し、覚え直す (開き直しても同じ範囲になるように)
      const fromUrl = takeUrlLoop(nextId);
      if (fromUrl !== null) {
        commit({ ...fromUrl, enabled: true });
      } else {
        state = loaded;
      }
      // 覚えていなければ「ループ再生」には触らない (README「動作の決まり」)。
      // video がまだ無い (document_start で起動した直後) ときは、最初の playing で当てる
      const video = mainVideo();
      if (completeRange(state) !== null && video !== null) video.loop = state.enabled;
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

/**
 * document_start で起動する (manifest)。**最初に URL を読む:** YouTube は読み込みの途中でクエリを消す。
 * body はまだ無いので、DOM の監視は documentElement に張る
 */
function start(): void {
  pendingUrlLoop = readUrlLoop(location.href);
  lastVideoId = currentVideoId();
  onVideoChanged(lastVideoId);
  new MutationObserver(onPageMutated).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  // yt-navigate-finish は YouTube 自身が SPA 遷移の終わりに出す。DOM の変化を待たずに追従できる
  document.addEventListener("yt-navigate-finish", onPageMutated);
  for (const type of ["timeupdate", "seeking", "playing", "loadedmetadata", "durationchange"]) {
    document.addEventListener(type, onMediaEvent, true);
  }
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("click", onLinkClick, true);
}

start();
