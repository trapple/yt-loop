import { YT_SELECTORS } from "@/content/selectors";

/** 出しておく長さ (ms) */
const SHOW_MS = 2000;

const STYLE =
  "position:absolute;top:12%;left:50%;transform:translateX(-50%);z-index:70;padding:8px 14px;border-radius:8px;background:rgba(28,28,28,0.9);color:#fff;font-family:Roboto,Arial,sans-serif;font-size:14px;pointer-events:none;white-space:nowrap;";

let current: HTMLElement | null = null;
let timer = 0;

/** プレイヤーの上に短い知らせを出す。プレイヤーが無ければ何もしない (知らせが無くても操作は済んでいる) */
export function showToast(text: string): void {
  const player = document.querySelector(YT_SELECTORS.player);
  if (player === null) return;

  current?.remove();
  window.clearTimeout(timer);
  const toast = document.createElement("div");
  toast.style.cssText = STYLE;
  toast.setAttribute("role", "status");
  toast.textContent = text;
  player.append(toast);
  current = toast;
  timer = window.setTimeout(() => {
    toast.remove();
    if (current === toast) current = null;
  }, SHOW_MS);
}
