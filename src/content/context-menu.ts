import { YT_SELECTORS } from "@/content/selectors";
import { canSetEnd, type LoopState } from "@/shared/loop";
import { formatTime } from "@/shared/time";

export type ContextMenuCallbacks = {
  /** 右クリックした時点の再生位置。読めなければ null (項目を押せなくする) */
  currentSec(): number | null;
  /** 今の状態。メニューを開くたびに読んで表示を合わせる */
  state(): LoopState;
  onSetStart(sec: number): void;
  onSetEnd(sec: number): void;
  onClear(): void;
};

export type ContextMenu = {
  /** プレイヤーの上で右クリックされた。メニューが開いた後に項目を差し、表示を合わせる */
  onContextMenu(): void;
  destroy(): void;
};

/** 足した項目の目印。差し直しのときに自分の項目を見分ける */
const OWN_ATTR = "data-yt-loop";

type ItemKind = "start" | "end" | "clear";

const LABELS: Record<ItemKind, string> = {
  start: "ここからループ",
  end: "ここまでループ",
  clear: "ループ範囲を解除",
};

/** 押せない項目。YouTube の項目には押せない状態の見た目が無いので自前で薄くする */
const DISABLED_STYLE = "opacity:0.4;cursor:default;";

/**
 * 標準の項目と同じ構造で作る (アイコン・ラベル・右の内容の 3 列)。YouTube の CSS がそのまま効き、
 * 見た目とホバーの反応が標準の項目と揃う
 */
function createItem(kind: ItemKind): HTMLElement {
  const item = document.createElement("div");
  item.className = "ytp-menuitem";
  item.setAttribute("role", "menuitem");
  item.setAttribute(OWN_ATTR, kind);
  item.tabIndex = 0;

  const icon = document.createElement("div");
  icon.className = "ytp-menuitem-icon";
  const label = document.createElement("div");
  label.className = "ytp-menuitem-label";
  label.textContent = LABELS[kind];
  const content = document.createElement("div");
  content.className = "ytp-menuitem-content";

  item.append(icon, label, content);
  return item;
}

export function createContextMenu(callbacks: ContextMenuCallbacks): ContextMenu {
  const items: Record<ItemKind, HTMLElement> = {
    start: createItem("start"),
    end: createItem("end"),
    clear: createItem("clear"),
  };
  /** 右クリックした時点の再生位置。項目を押した時点ではない (メニューを開いている間も動画は進む) */
  let clickedSec: number | null = null;
  let openFrame = 0;

  function close(menu: Element): void {
    // display:none で隠すと YouTube の内部状態は開いたままで、次の右クリックで開かなくなる (README の実測)。
    // 標準の閉じ方 (Escape) を使う
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }),
    );
  }

  function bind(kind: ItemKind): void {
    items[kind].addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = items[kind].closest(YT_SELECTORS.contextMenu);
      if (items[kind].getAttribute("aria-disabled") === "true") return;
      const sec = clickedSec;
      if (kind === "clear") {
        callbacks.onClear();
      } else if (sec !== null) {
        if (kind === "start") callbacks.onSetStart(sec);
        else callbacks.onSetEnd(sec);
      }
      if (menu !== null) close(menu);
    });
  }
  bind("start");
  bind("end");
  bind("clear");

  function setDisabled(item: HTMLElement, disabled: boolean): void {
    item.setAttribute("aria-disabled", String(disabled));
    item.style.cssText = disabled ? DISABLED_STYLE : "";
  }

  /** 項目の右の欄に記録済みの時刻を出し、押せるかを合わせる */
  function paint(): void {
    const state = callbacks.state();
    const time = (sec: number | null): string => (sec === null ? "" : formatTime(sec));
    items.start.lastElementChild!.textContent = time(state.startSec);
    items.end.lastElementChild!.textContent = time(state.endSec);

    setDisabled(items.start, clickedSec === null);
    setDisabled(items.end, clickedSec === null || !canSetEnd(state, clickedSec));
    // 消すものが無いときは出さない。[hidden] は .ytp-menuitem の display に負けるので style で消す
    items.clear.style.display = state.startSec === null && state.endSec === null ? "none" : "";
  }

  /**
   * 標準「ループ再生」の直後に差す。メニューが作り直されていたら差し直す。
   * 差したら高さを直す (YouTube は開くときに高さをインラインで固定する。README の実測)
   */
  function inject(menu: HTMLElement): void {
    const list = menu.querySelector<HTMLElement>(".ytp-panel-menu");
    if (list === null) return;
    const loopItem = list.querySelector(YT_SELECTORS.loopMenuItem);
    const after = loopItem ?? list.firstElementChild;
    if (items.start.previousElementSibling !== after || items.start.parentElement !== list) {
      if (after === null) list.prepend(items.start, items.end, items.clear);
      else after.after(items.start, items.end, items.clear);
    }
    paint();
    fitHeight(menu, list);
  }

  function fitHeight(menu: HTMLElement, list: HTMLElement): void {
    const panel = list.closest<HTMLElement>(".ytp-panel");
    // 固定を外してから中身の高さを測る。固定したままだと、解除を隠して項目が減ったときに縮まない
    list.style.height = "";
    const height = list.scrollHeight;
    for (const el of [menu, panel, list]) {
      if (el !== null) el.style.height = `${height}px`;
    }
    // 下へはみ出す分だけ上へずらす。YouTube は足す前の高さで位置を決めている
    const container = menu.offsetParent;
    if (container instanceof HTMLElement) {
      const overflow = menu.offsetTop + height - container.clientHeight;
      if (overflow > 0) menu.style.top = `${Math.max(0, menu.offsetTop - overflow)}px`;
    }
  }

  return {
    onContextMenu(): void {
      clickedSec = callbacks.currentSec();
      // メニューは YouTube の contextmenu の処理で作られ・開かれる。その後に触る
      cancelAnimationFrame(openFrame);
      openFrame = requestAnimationFrame(() => {
        openFrame = 0;
        const menu = document.querySelector<HTMLElement>(YT_SELECTORS.contextMenu);
        if (menu === null || menu.style.display === "none") return;
        inject(menu);
      });
    },

    destroy(): void {
      cancelAnimationFrame(openFrame);
      for (const item of Object.values(items)) item.remove();
    },
  };
}
