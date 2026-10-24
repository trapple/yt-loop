import {
  EMPTY_LOOP,
  END_GUARD_SEC,
  becameComplete,
  canSetEnd,
  effectiveEnd,
  setEnd,
  setStart,
  shouldJumpBack,
  type LoopState,
} from "@/shared/loop";

const looping = { startSec: 10, endSec: 20, enabled: true } satisfies LoopState;

describe("setStart", () => {
  it("A を置く", () => {
    expect(setStart(EMPTY_LOOP, 10, 100)).toEqual({ startSec: 10, endSec: null, enabled: false });
  });

  it("B 以降に置いたら B を消す", () => {
    expect(setStart(looping, 30, 100)).toEqual({ startSec: 30, endSec: null, enabled: true });
  });

  it("動画の長さで頭打ちにする", () => {
    expect(setStart(EMPTY_LOOP, 500, 100).startSec).toBe(100);
  });
});

describe("setEnd / canSetEnd", () => {
  it("A が無ければどこにでも置ける", () => {
    expect(canSetEnd(EMPTY_LOOP, 0)).toBe(true);
    expect(setEnd(EMPTY_LOOP, 5, 100)?.endSec).toBe(5);
  });

  it("A より 0.2 秒以上後でなければ置けない", () => {
    expect(canSetEnd(looping, 10.1)).toBe(false);
    expect(setEnd(looping, 10.1, 100)).toBeNull();
    expect(setEnd(looping, 10.2, 100)?.endSec).toBe(10.2);
  });

  it("動画の長さで頭打ちにする", () => {
    expect(setEnd(looping, 500, 100)?.endSec).toBe(100);
  });
});

describe("becameComplete", () => {
  it("A と B が初めてそろったときだけ真", () => {
    const a = setStart(EMPTY_LOOP, 10, 100);
    const ab = setEnd(a, 20, 100)!;
    expect(becameComplete(a, ab)).toBe(true);
    expect(becameComplete(ab, setEnd(ab, 25, 100)!)).toBe(false);
  });
});

describe("shouldJumpBack", () => {
  it("B を過ぎたら戻す", () => {
    expect(shouldJumpBack(looping, 19.9, 100)).toBe(false);
    expect(shouldJumpBack(looping, 20, 100)).toBe(true);
  });

  it("A より前は戻さない (前奏から入れる)", () => {
    expect(shouldJumpBack(looping, 5, 100)).toBe(false);
  });

  it("オフなら戻さない", () => {
    expect(shouldJumpBack({ ...looping, enabled: false }, 30, 100)).toBe(false);
  });

  it("B が末尾なら末尾の手前で折り返す", () => {
    const toEnd = { startSec: 10, endSec: 100, enabled: true };
    expect(effectiveEnd(toEnd, 100)).toBe(100 - END_GUARD_SEC);
    expect(shouldJumpBack(toEnd, 99.8, 100)).toBe(true);
  });

  it("長さが分からない (ライブ) なら B のまま", () => {
    expect(effectiveEnd(looping, Infinity)).toBe(20);
    expect(effectiveEnd(looping, NaN)).toBe(20);
  });
});
