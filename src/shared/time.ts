/** 再生位置として妥当か検査する。妥当でなければ throw (Fail Fast) */
export function assertPlayableSeconds(sec: number, label: string): void {
  if (!Number.isFinite(sec) || sec < 0) {
    throw new RangeError(`${label} が再生位置として不正です: ${sec}`);
  }
}

/**
 * 再生位置を `m:ss.s` / `h:mm:ss.s` 形式に整形する (小数 1 桁)。
 * ループの微調整は 0.1 秒単位なので、整数秒では差が見えない
 */
export function formatTime(totalSec: number): string {
  assertPlayableSeconds(totalSec, "再生位置");
  // 先に 0.1 秒単位へ丸める。秒と小数を別々に丸めると 59.96 が「0:59.10」のように崩れる
  const tenths = Math.round(totalSec * 10);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const ss = `${String(seconds).padStart(2, "0")}.${fraction}`;
  if (hours === 0) {
    return `${minutes}:${ss}`;
  }
  return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
}
