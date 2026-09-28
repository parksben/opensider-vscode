/**
 * Version comparison used only to decide whether to offer an update.
 *
 * Only plain numeric segments count (`v0.1.0` / `0.1` are fine). `dev`, an empty
 * string, or a pre-release suffix is incomparable: a dev build must not nag.
 */
function parse(value: string | undefined): number[] | undefined {
  const text = (value ?? "").trim().replace(/^v/i, "");
  if (!text || !/^\d+(\.\d+)*$/.test(text)) return undefined;
  return text.split(".").map((part) => Number(part));
}

/** 1 when a is newer, -1 when b is newer, 0 when equal or either side is incomparable. */
export function compareVersions(a: string | undefined, b: string | undefined): number {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const x = left[index] ?? 0;
    const y = right[index] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** True only when latest is a newer numeric version than current. */
export function isNewer(latest: string | undefined, current: string | undefined): boolean {
  return compareVersions(latest, current) > 0;
}

/** Strip a tag's `v` (`v0.1.0` → `0.1.0`). Empty stays undefined. */
export function displayVersion(value: string | undefined): string | undefined {
  const text = (value ?? "").trim().replace(/^v/i, "");
  return text || undefined;
}
