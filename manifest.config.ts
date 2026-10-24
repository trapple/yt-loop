import { defineManifest } from "@crxjs/vite-plugin";
import { readFileSync } from "node:fs";

/**
 * 版番号は `package.json` から読む。**ここに直接書かないこと。**
 * 2 箇所に手書きすると、片方を上げたときにもう片方が置いていかれる
 */
function packageVersion(): string {
  const path = new URL("./package.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const version =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).version
      : undefined;

  if (typeof version !== "string") {
    throw new Error("package.json に version がありません");
  }
  // Chrome が受け付けるのは 1〜4 個の整数をドットで繋いだ形だけ
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(
      `Chrome が受け付けない版番号です: ${version} (整数をドットで繋いだ形のみ)`,
    );
  }
  return version;
}

const icons = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
};

/** 権限は README「必要な権限」表と 1:1 対応させる */
export default defineManifest({
  manifest_version: 3,
  name: "yt-loop",
  version: packageVersion(),
  description: "YouTube の指定した範囲を繰り返し再生する",
  permissions: ["storage"],
  icons,
  content_scripts: [
    {
      // **動画ページ (/watch) だけに絞らない。** YouTube の中の移動は SPA なので、ホームや検索結果から
      // 動画へ移ってもドキュメントの読み込みが起きず、/watch* だけだと content script が入らない
      matches: ["https://www.youtube.com/*"],
      js: ["src/content/youtube.ts"],
      run_at: "document_idle",
    },
  ],
});
