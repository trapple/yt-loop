# yt-loop 開発者向けメモ

利用者向けの説明 (できること・動作の決まり) は [README](../README.md) にある。ここには、作りと YouTube の実測、開発の手順を置く。

Chrome 拡張 (Manifest V3)。TypeScript と Vite (crxjs) でビルドする。

## 開発

```sh
npm install
npm run build       # dist/ にビルド
npm test            # 単体テスト (vitest)
npm run typecheck
npm run icons       # public/icons/ を描き直す (Playwright の Chromium を使う)
npm run package     # ストアへ上げる zip を release/ に作る
npm run screenshots # ストア掲載用のスクリーンショットを release/screenshots/ に撮る
```

Chrome の `chrome://extensions` でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」で `dist/` を選ぶ。

ストアへの公開手順は [store-release.md](store-release.md)、プライバシーポリシーは [privacy-policy.md](privacy-policy.md)。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/content/youtube.ts` | content script の入口。SPA 遷移の追従、ループの見張り、URL ごとの状態の読み書き |
| `src/content/context-menu.ts` | 右クリックメニューへの項目の差し込み |
| `src/content/progress-band.ts` | シークバーに重ねる帯 |
| `src/main-world/seek-bridge.ts` | ページの側 (main world) で YouTube のシークを呼ぶ橋。content script とモジュールを共有しない (共有するとビルドが非同期のローダー経由に変える) |
| `src/content/toast.ts` | プレイヤーの上に短く出す知らせ (URL をコピーしたとき) |
| `src/content/selectors.ts` | YouTube の DOM セレクタの集約 |
| `src/shared/loop.ts` | 範囲の検査・折り返し判定などの純粋な関数 (テスト対象) |
| `src/shared/time.ts` | 時刻の整形 |
| `src/shared/share-url.ts` | URL のクエリの読み取りと共有用の URL の組み立て |
| `src/shared/storage.ts` | URL ごとの範囲の保存と読み込み |

## 動作の決まりの実装

README「動作の決まり」を実装するうえでの決まり。

- ON / OFF の正は `video.loop` の側。標準「ループ再生」のチェックと連動する
- 範囲とオン / オフは `chrome.storage.local` に、動画 ID を鍵にして覚える
- A へ戻すときは YouTube 自身のシーク (`movie_player.seekTo`) を使う (下記「実装上の注意 (シーク)」)
- 広告の再生中は `#movie_player.ad-showing` で見分ける
- 再生位置の見張りは `requestAnimationFrame` (タブが見えている間の精度) と `timeupdate` (背景タブでも届く。約 250ms 間隔) の両方で行う。背景タブで B から戻るのが遅れうるのはこのため

## 実装上の注意 (YouTube の右クリックメニュー)

2026-10 時点の実測。

- メニュー (`.ytp-popup.ytp-contextmenu`) は最初の右クリックで作られる。それまで DOM に無い
- 標準「ループ再生」は `.ytp-menuitem[role=menuitemcheckbox]` で、`video.loop` と連動する。`video.loop` を直接書き換えると、次に開いたときのチェック表示も追従する
- メニューの高さはポップアップ・`.ytp-panel`・`.ytp-panel-menu` にインラインで固定されている。項目を足したら 3 つとも高さを直す
- 項目を足して高くなったメニューを、YouTube は 2 回目以降の右クリックでどこを押しても画面の上端 (`top:0`) に置く。足さない素の状態では押した位置に出るので、縦の位置は拡張が右クリックした位置に置き直す
- 閉じるには Escape を送る。`display:none` で隠すと YouTube の内部状態は「開いている」ままで、次の右クリックで開かなくなる

## 実装上の注意 (シーク)

- **`video.currentTime` を直接書き換えてシークしない。** YouTube が自分でシークしている最中 (タイムスタンプのリンクを踏んだ直後など) に書き換えると、YouTube の思っている位置と動画の位置がずれ、読み込み中のまま止まる (2026-10 に実機で発生)
- `movie_player.seekTo` はページの JavaScript (main world) にしか見えない。main world で動く小さな content script (`src/main-world/seek-bridge.ts`) を置き、拡張の側 (isolated world) からは DOM のイベントで頼む。橋が見つからないときだけ `video.currentTime` を直接書き換える

## 実装上の注意 (URL のクエリ)

- **YouTube は読み込みの途中で知らないクエリを URL から消す** (`domcontentloaded` の時点では残っていて、動画が読み込まれた後には無い。2026-10 の実測)。そのため content script は `document_start` で動かし、起動した時点で URL を読む
- YouTube の中のリンクを押した移動 (SPA 遷移) ではページを読み込み直さないので、リンクのクリックを捕まえてその URL から読む
- メニューの項目を押した操作の中で、`navigator.clipboard.writeText` でクリップボードへ書き込む。追加の権限は要らない

## 参考

[yt-clip](https://github.com/trapple/yt-clip) (同じ作者の切り抜き拡張。SPA 追従とシークバーの帯の作り方を踏襲)
