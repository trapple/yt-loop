import { readFileSync } from "node:fs";

/**
 * content script と main world の橋は、ビルドの都合で取り決めの値を共有できず、それぞれに書いてある
 * (src/main-world/seek-bridge.ts のコメント)。どちらかだけを変えると、シークの頼みが黙って届かなくなる
 */
function constantsOf(path: string): Record<string, string> {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const found: Record<string, string> = {};
  for (const name of ["SEEK_EVENT", "BRIDGE_READY_ATTR"]) {
    const match = source.match(new RegExp(`const ${name} = "([^"]+)";`));
    if (match?.[1] === undefined) throw new Error(`${path} に ${name} がありません`);
    found[name] = match[1];
  }
  return found;
}

describe("シークの橋の取り決め", () => {
  it("content script と main world の橋で同じ値を使う", () => {
    expect(constantsOf("src/content/youtube.ts")).toEqual(constantsOf("src/main-world/seek-bridge.ts"));
  });
});
