/**
 * 拡張のアイコンを描き出す。
 *
 * 循環する矢印の中に再生の三角、という図。**YouTube の意匠・色は使わない。**
 * 公式との混同を招くものはウェブストアの審査で落ちる。
 *
 *   node scripts/make-icons.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/** 16px まで縮めても潰れないよう、線は太めに取る */
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="0" y="0" width="128" height="128" rx="26" fill="#202124"/>
  <g stroke="#e8eaed" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M98 50 A38 38 0 1 0 100 76"/>
    <path d="M100 30 V52 H78"/>
  </g>
  <path d="M54 46 L80 64 L54 82 Z" fill="#3ea6ff"/>
</svg>`;

const SIZES = [16, 32, 48, 128];

const browser = await chromium.launch({ timeout: 30_000 });
try {
  const page = await browser.newPage();
  mkdirSync("public/icons", { recursive: true });

  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0">${svg(size)}</body>`, { timeout: 10_000 });
    const png = await page.screenshot({ omitBackground: true, timeout: 10_000 });
    writeFileSync(`public/icons/icon-${size}.png`, png);
    console.log(`public/icons/icon-${size}.png (${png.length} bytes)`);
  }
} finally {
  await browser.close();
}
