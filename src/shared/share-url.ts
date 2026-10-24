import { completeRange, type CompleteRange } from "@/shared/loop";

/** URL のクエリ名 (README「URL でループを指定する」) */
export const START_PARAM = "yt-loop-start";
export const END_PARAM = "yt-loop-end";

export type UrlLoop = { videoId: string; range: CompleteRange };

/** クエリの秒数を読む。符号や指数表記 (`1e3`) は受け付けない (人が書く値ではない) */
function parseSeconds(text: string | null): number | null {
  if (text === null || !/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/**
 * URL からループの範囲を読む。動画ページでない・2 つがそろっていない・読めない・短すぎるときは null
 * (覚えていた範囲を使う)
 */
export function readUrlLoop(href: string): UrlLoop | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== "/watch") return null;
  const videoId = url.searchParams.get("v");
  if (videoId === null || videoId === "") return null;

  const startSec = parseSeconds(url.searchParams.get(START_PARAM));
  const endSec = parseSeconds(url.searchParams.get(END_PARAM));
  const range = completeRange({ startSec, endSec, enabled: false });
  return range === null ? null : { videoId, range };
}

/** クエリに載せる秒数。0.1 秒単位に丸め、余計な 0 は付けない (`12.3` / `12`) */
export function formatParamSeconds(sec: number): string {
  return String(Math.round(sec * 10) / 10);
}

/**
 * 共有用の URL を組み立てる。`t` には A の整数秒を入れる: 拡張が入っていない人には、
 * ループではなく A から再生されるリンクとして働く。`list=` などは載せない
 */
export function buildShareUrl(videoId: string, range: CompleteRange): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("t", `${Math.floor(range.startSec)}s`);
  url.searchParams.set(START_PARAM, formatParamSeconds(range.startSec));
  url.searchParams.set(END_PARAM, formatParamSeconds(range.endSec));
  return url.toString();
}
