import { decodeLoop } from "@/shared/storage";

describe("decodeLoop", () => {
  it("正しい値はそのまま", () => {
    expect(decodeLoop({ startSec: 1, endSec: 2, enabled: true })).toEqual({ startSec: 1, endSec: 2, enabled: true });
  });

  it("崩れた値は空として扱う", () => {
    expect(decodeLoop("x")).toEqual({ startSec: null, endSec: null, enabled: false });
    expect(decodeLoop({ startSec: -1, endSec: "2", enabled: 1 })).toEqual({ startSec: null, endSec: null, enabled: false });
  });
});
