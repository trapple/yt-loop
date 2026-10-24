/**
 * ウェブストア掲載用のスクリーンショットを撮る。
 *
 *   npm run screenshots
 *
 * 1280x800 で `release/screenshots/` に書き出す。
 *
 * **題材は Big Buck Bunny (Blender Foundation, Creative Commons)。**
 * 掲載画像には動画の中身がそのまま写るので、権利関係で問題にならないものを使う。
 */
import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_PATH = fileURLToPath(new URL("../dist", import.meta.url));
const VIDEO = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const OUT_DIR = "release/screenshots";

/** ストアが受け付ける寸法 */
const WIDTH = 1280;
const HEIGHT = 800;

/**
 * 写す範囲 (秒)。A を置いた後に B を置き、範囲の途中でメニューを開いて撮る。
 * B を置いた瞬間にループが働いて A へ戻るので、そのまま開くと「ここまでループ」が押せない表示 (A の位置) で写る
 */
const START_SEC = 120;
const END_SEC = 300;
const SHOT_SEC = 200;

/** ブラウザ起動やページ遷移が固まったまま待ち続けないようにする */
const LAUNCH_TIMEOUT_MS = 60_000;
const NAV_TIMEOUT_MS = 60_000;
const WAIT_TIMEOUT_MS = 30_000;

const userDataDir = await mkdtemp(join(tmpdir(), "yt-loop-shot-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  viewport: { width: WIDTH, height: HEIGHT },
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    `--window-size=${WIDTH},${HEIGHT}`,
  ],
  timeout: LAUNCH_TIMEOUT_MS,
});

try {
  mkdirSync(OUT_DIR, { recursive: true });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_TIMEOUT_MS);
  await page.goto(VIDEO, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  // **関連動画の中身を隠す。** 掲載画像に他人の動画のサムネイルが写り込むのを避ける。
  // **右の列 (#secondary) そのものは残す**: 列ごと隠すとプレイヤーの幅が実際の YouTube と変わる
  await page.addStyleTag({
    content:
      "#related, #chat, ytd-watch-next-secondary-results-renderer, #comments { display: none !important; }",
  });

  // 広告が終わり、本編の長さが読めるまで待つ
  await page.waitForFunction(
    () => {
      const v = document.querySelector("video.html5-main-video");
      return v !== null && v.duration > 0 && !document.querySelector("#movie_player.ad-showing");
    },
    null,
    { timeout: NAV_TIMEOUT_MS },
  );

  const player = page.locator("#movie_player");
  /** 右クリックメニューを開く。直前に閉じたばかりだと開かないことがあるので間を置き、出たことを確かめる */
  async function openMenu() {
    await page.waitForTimeout(500);
    await player.click({ button: "right", position: { x: 440, y: 16 } });
    await page.locator('.ytp-contextmenu [data-yt-loop="start"]').waitFor({ state: "visible" });
  }

  /** 止めた位置で右クリックメニューを開く (位置は右クリックした時点で読まれる) */
  async function openMenuAt(sec) {
    // **シークの完了 (seeked) は待たない。** 自動操作のブラウザでは YouTube が最初の 20 秒ほどしか映像を
    // 読ませず、その先へのシークは完了しないまま止まる (YouTube 自身の seekTo でも同じ。2026-10 の実測)。
    // 位置 (currentTime) と時刻の表示は変わるので、メニューと帯を写す用途には足りる
    await page.evaluate((s) => {
      const v = document.querySelector("video.html5-main-video");
      v.pause();
      v.currentTime = s;
    }, sec);
    await page.waitForTimeout(500);
    await openMenu();
  }

  await openMenuAt(START_SEC);
  await page.locator('[data-yt-loop="start"]').click();
  await openMenuAt(END_SEC);
  await page.locator('[data-yt-loop="end"]').click();

  // メニューを開いた状態で、シークバー (帯) も見えるようにプレイヤーの上にカーソルを置いておく
  // 時刻の表示はシークが完了しないと追従しないことがある (B の位置のまま写りうる)。掲載画像としては差し支えない
  await openMenuAt(SHOT_SEC);
  await player.hover({ position: { x: 440, y: 16 } });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT_DIR}/1-menu.png` });
  console.log(`${OUT_DIR}/1-menu.png`);
} finally {
  await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}
