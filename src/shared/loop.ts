import { assertPlayableSeconds } from "@/shared/time";

/** ループが効く最小の長さ (秒)。これより短いと戻した直後にまた戻す、を繰り返して音が出ない */
export const MIN_LOOP_SEC = 0.2;

/**
 * 動画の末尾からこれだけ手前で折り返す (秒)。
 * 末尾まで行くと、標準のループ (`video.loop`) が A ではなく動画の先頭へ戻してしまう
 */
export const END_GUARD_SEC = 0.25;

/**
 * URL ごとに覚える状態。A / B は片方ずつ決まり、未設定は null。
 * `enabled` は標準「ループ再生」(`video.loop`) の写し。**正は video.loop の側** (README「できること」)
 */
export type LoopState = {
  startSec: number | null;
  endSec: number | null;
  enabled: boolean;
};

export const EMPTY_LOOP: LoopState = { startSec: null, endSec: null, enabled: false };

/**
 * a から b までが最小の長さ以上か。**比較はここで行う。** 浮動小数の引き算は 10.2 - 10 = 0.19999… になり、
 * 素の `>=` だとちょうど最小の長さの範囲を弾く
 */
function longEnough(fromSec: number, toSec: number): boolean {
  return toSec - fromSec >= MIN_LOOP_SEC - 1e-9;
}

export type CompleteRange = { startSec: number; endSec: number };

/** A と B が両方決まっていて、ループとして成り立つか */
export function completeRange(state: LoopState): CompleteRange | null {
  const { startSec, endSec } = state;
  if (startSec === null || endSec === null) return null;
  if (!longEnough(startSec, endSec)) return null;
  return { startSec, endSec };
}

/** 編集で範囲が初めてそろったか。そろったらループを自動でオンにする */
export function becameComplete(prev: LoopState, next: LoopState): boolean {
  return completeRange(prev) === null && completeRange(next) !== null;
}

/**
 * A を置く。B 以降に置いたら B を消す (A から決め直す操作を妨げない)。
 * 動画の長さで頭打ちにする
 */
export function setStart(state: LoopState, sec: number, durationSec: number): LoopState {
  assertPlayableSeconds(sec, "開始位置");
  const startSec = Math.min(sec, durationSec);
  const endSec =
    state.endSec !== null && !longEnough(startSec, state.endSec) ? null : state.endSec;
  return { ...state, startSec, endSec };
}

/** B をそこへ置けるか。A 以前には置けない (A を消すと、何を基準にしていたかが失われる) */
export function canSetEnd(state: LoopState, sec: number): boolean {
  return state.startSec === null || longEnough(state.startSec, sec);
}

/** B を置く。置けない位置なら null */
export function setEnd(state: LoopState, sec: number, durationSec: number): LoopState | null {
  assertPlayableSeconds(sec, "終了位置");
  const endSec = Math.min(sec, durationSec);
  if (!canSetEnd(state, endSec)) return null;
  return { ...state, endSec };
}

/**
 * 実際に折り返す位置。B が末尾に近ければ末尾の手前で折り返す (END_GUARD_SEC)。
 * 動画の長さが分からない (NaN / Infinity。ライブ配信など) ときは B のまま
 */
export function effectiveEnd(range: CompleteRange, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return range.endSec;
  const guarded = durationSec - END_GUARD_SEC;
  // 末尾の手前が A 以前になる (A が末尾ぎりぎり) なら、守りを諦めて B を使う
  if (!longEnough(range.startSec, guarded)) return range.endSec;
  return Math.min(range.endSec, guarded);
}

/** 今の位置がもう折り返す位置を過ぎているか (オンで範囲がそろっているときだけ真) */
export function isPastEnd(state: LoopState, currentSec: number, durationSec: number): boolean {
  if (!state.enabled) return false;
  const range = completeRange(state);
  if (range === null) return false;
  return currentSec >= effectiveEnd(range, durationSec);
}

/**
 * A へ戻すべきか。**再生が B をまたいだときだけ戻す** (前に見た位置が B より手前で、今が B 以降)。
 *
 * 「今 B 以降か」だけで決めない: シークで B より後へ飛んだとき (タイムスタンプのリンクなど) に A へ引き戻すと、
 * 利用者の操作を打ち消すうえ、YouTube のシークの最中に割り込んで読み込み中のまま止まる (README「動作の決まり」)。
 * シークの後は前の位置を null にして渡すこと (またいだかどうかが分からない)。A より前もシークで入れば戻さない
 */
export function shouldJumpBack(
  state: LoopState,
  prevSec: number | null,
  currentSec: number,
  durationSec: number,
): boolean {
  if (prevSec === null) return false;
  return !isPastEnd(state, prevSec, durationSec) && isPastEnd(state, currentSec, durationSec);
}
