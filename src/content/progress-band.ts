import { completeRange, type LoopState } from "@/shared/loop";

export type ProgressBand = {
  /**
   * シークバーに帯を重ねる。差す先が無い・範囲がそろっていない・長さが分からないときは外す。
   * YouTube はシークバーを作り直すことがあるので、呼ぶたびに差す先を確かめる
   */
  refresh(bar: Element | null, state: LoopState, durationSec: number): void;
  destroy(): void;
};

const STYLE =
  "position:absolute;top:0;bottom:0;z-index:40;pointer-events:none;border-left:2px solid #3ea6ff;border-right:2px solid #3ea6ff;box-sizing:border-box;";

export function createProgressBand(): ProgressBand {
  const band = document.createElement("div");
  band.id = "yt-loop-band";
  band.style.cssText = STYLE;

  return {
    refresh(bar, state, durationSec): void {
      const range = completeRange(state);
      if (bar === null || range === null || !Number.isFinite(durationSec) || durationSec <= 0) {
        band.remove();
        return;
      }
      if (band.parentElement !== bar) bar.append(band);

      const left = Math.min(1, range.startSec / durationSec) * 100;
      const right = Math.min(1, range.endSec / durationSec) * 100;
      band.style.left = `${left}%`;
      band.style.width = `${right - left}%`;
      // オフの間も範囲は見せる。薄くしてオンと区別する
      band.style.background = state.enabled ? "rgba(62,166,255,0.45)" : "rgba(62,166,255,0.18)";
    },

    destroy(): void {
      band.remove();
    },
  };
}
