/**
 * Pulls the numeric VS Code window id out of an extension log path.
 *
 * Desktop builds put each window's extension host under a directory named
 * `window<id>` (VS Code) or `window<id>_wb<n>` (Cursor, where `<n>` counts workbench
 * reloads). That `<id>` is `vscodeWindowId` — the same number the integrated browser
 * and Playwright use to decide which window a tab opens in.
 */
export function windowIdFromLogPath(logPath: string): number | undefined {
  const re = /[/\\]window(\d+)(?:_wb\d+)?(?=[/\\]|$)/g;
  let id: number | undefined;
  for (const match of logPath.matchAll(re)) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0) id = n;
  }
  return id;
}
