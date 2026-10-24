import { EMPTY_LOOP, type LoopState } from "@/shared/loop";

/** 動画ごとの鍵。動画 ID 以外のものと混ざらないよう前置きを付ける */
function keyOf(videoId: string): string {
  return `loop:${videoId}`;
}

/** 保存されていた値を読む。形が崩れていたら空として扱う (古い版や手で書き換えた値で止めない) */
export function decodeLoop(raw: unknown): LoopState {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_LOOP };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  return {
    startSec: num(r.startSec),
    endSec: num(r.endSec),
    enabled: r.enabled === true,
  };
}

export async function loadLoop(videoId: string): Promise<LoopState> {
  const key = keyOf(videoId);
  const stored = await chrome.storage.local.get(key);
  return decodeLoop(stored[key]);
}

/** 空になったら消す。範囲を作っては消した動画の鍵が溜まり続けないように */
export async function saveLoop(videoId: string, state: LoopState): Promise<void> {
  const key = keyOf(videoId);
  if (state.startSec === null && state.endSec === null) {
    await chrome.storage.local.remove(key);
    return;
  }
  await chrome.storage.local.set({ [key]: state });
}
