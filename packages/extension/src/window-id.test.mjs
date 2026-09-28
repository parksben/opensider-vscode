import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "node_modules/.cache/window-id.test.cjs");

buildSync({
  entryPoints: [path.join(root, "src/window-id.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
});

const { windowIdFromLogPath } = createRequire(import.meta.url)(outfile);

test("reads the vscode window id from a Cursor log path", () => {
  const logPath =
    "/Users/me/Library/Application Support/Cursor/logs/20260924T174559/window1_wb49/exthost/opensider.opensider-vscode";
  assert.equal(windowIdFromLogPath(logPath), 1);
});

test("reads a plain VS Code window directory", () => {
  const logPath = "/Users/me/Library/Application Support/Code/logs/20260915T184134/window29/exthost/opensider.opensider-vscode";
  assert.equal(windowIdFromLogPath(logPath), 29);
});

test("reads a Windows log path", () => {
  const logPath = "C:\\Users\\me\\AppData\\Roaming\\Code\\logs\\20260915T184134\\window3\\exthost\\opensider.opensider-vscode";
  assert.equal(windowIdFromLogPath(logPath), 3);
});

test("uses the last window segment when a path contains more than one", () => {
  const logPath = "/tmp/window1_wb2/nested/window4/exthost/ext";
  assert.equal(windowIdFromLogPath(logPath), 4);
});

test("returns undefined when the path has no window segment", () => {
  assert.equal(windowIdFromLogPath("/tmp/exthost/opensider"), undefined);
  assert.equal(windowIdFromLogPath(""), undefined);
});
