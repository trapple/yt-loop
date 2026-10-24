import { formatTime } from "@/shared/time";

describe("formatTime", () => {
  it("分:秒.小数 で出す", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(83.44)).toBe("1:23.4");
    expect(formatTime(3723)).toBe("1:02:03.0");
  });

  it("繰り上がりで秒が 60 にならない", () => {
    expect(formatTime(59.96)).toBe("1:00.0");
  });

  it("負や NaN は throw", () => {
    expect(() => formatTime(-1)).toThrow(RangeError);
    expect(() => formatTime(NaN)).toThrow(RangeError);
  });
});
