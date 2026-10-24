import { buildShareUrl, formatParamSeconds, readUrlLoop } from "@/shared/share-url";

const BASE = "https://www.youtube.com/watch?v=vzQcOVGZEig";

describe("readUrlLoop", () => {
  it("2 つのクエリから範囲を読む", () => {
    expect(readUrlLoop(`${BASE}&t=12234s&yt-loop-start=12234&yt-loop-end=12250.5`)).toEqual({
      videoId: "vzQcOVGZEig",
      range: { startSec: 12234, endSec: 12250.5 },
    });
  });

  it.each([
    ["片方だけ", `${BASE}&yt-loop-start=10`],
    ["読めない値", `${BASE}&yt-loop-start=abc&yt-loop-end=20`],
    ["負の値", `${BASE}&yt-loop-start=-1&yt-loop-end=20`],
    ["短すぎる範囲", `${BASE}&yt-loop-start=10&yt-loop-end=10.1`],
    ["逆順", `${BASE}&yt-loop-start=20&yt-loop-end=10`],
    ["動画ページでない", "https://www.youtube.com/results?yt-loop-start=1&yt-loop-end=5"],
    ["URL でない", "not a url"],
  ])("%s は null", (_label, href) => {
    expect(readUrlLoop(href)).toBeNull();
  });
});

describe("formatParamSeconds", () => {
  it("0.1 秒単位に丸め、余計な 0 を付けない", () => {
    expect(formatParamSeconds(12)).toBe("12");
    expect(formatParamSeconds(12.34)).toBe("12.3");
    expect(formatParamSeconds(0.1 + 0.2)).toBe("0.3");
  });
});

describe("buildShareUrl", () => {
  it("v / t / 範囲を載せる。t は A の整数秒", () => {
    expect(buildShareUrl("vzQcOVGZEig", { startSec: 12234.56, endSec: 12250 })).toBe(
      `${BASE}&t=12234s&yt-loop-start=12234.6&yt-loop-end=12250`,
    );
  });

  it("組み立てた URL を読み戻せる", () => {
    const url = buildShareUrl("abc", { startSec: 3.2, endSec: 9.8 });
    expect(readUrlLoop(url)).toEqual({ videoId: "abc", range: { startSec: 3.2, endSec: 9.8 } });
  });
});
