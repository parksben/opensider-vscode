import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outfile = path.join(root, "node_modules/.cache/handoff.test.cjs");

buildSync({
  stdin: {
    contents: [
      'export { buildHandoffPrompt } from "./handoff";',
      'export { groupModelsByPrefix, modelShortName } from "./model-groups";',
      'export { nextThreadScroll } from "./thread-follow";',
      'export { browserExtensionInstalled } from "../browser-install";',
    ].join("\n"),
    resolveDir: path.join(root, "src/sidepanel"),
    sourcefile: "handoff-test-entry.ts",
    loader: "ts",
  },
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
});

const { buildHandoffPrompt, groupModelsByPrefix, modelShortName, nextThreadScroll, browserExtensionInstalled } =
  createRequire(import.meta.url)(outfile);

test("groups model names on the slash", () => {
  const groups = groupModelsByPrefix([
    { name: "OpenCode Zen/Big Pickle" },
    { name: "OpenCode Zen/Ling 3.0 Flash" },
    { name: "StepCode (Anthropic)" },
  ]);
  assert.deepEqual(
    groups.map((group) => ({ label: group.label, names: group.items.map((item) => modelShortName(item.name)) })),
    [
      { label: "OpenCode Zen", names: ["Big Pickle", "Ling 3.0 Flash"] },
      { label: "", names: ["StepCode (Anthropic)"] },
    ],
  );
});

test("handoff prompt names the browser extension and the workspace", () => {
  const prompt = buildHandoffPrompt({
    locale: "zh",
    target: "browser",
    workspace: "/tmp/repo",
    turns: [
      { role: "user", text: "看一下滚动" },
      { role: "assistant", text: "已经钉住了" },
    ],
  });
  assert.match(prompt, /浏览器端 OpenSider/);
  assert.match(prompt, /工作区：\/tmp\/repo/);
  assert.match(prompt, /User: 看一下滚动/);
});

test("scrolled-up reading keeps its place when the transcript grows", () => {
  assert.equal(nextThreadScroll(true, 0, -40), null);
  assert.equal(nextThreadScroll(true, -20, -40), 0);
  assert.equal(nextThreadScroll(false, -200, -40), -240);
});

test("detects an unpacked browser extension from the profile preferences", () => {
  const profile = path.join(tmpdir(), `opensider-browser-probe-${Date.now()}`);
  mkdirSync(path.join(profile, "Default"), { recursive: true });
  writeFileSync(
    path.join(profile, "Default", "Preferences"),
    JSON.stringify({ extensions: { settings: { gcblddgaifebccglndkaccmibhechimj: { path: "/tmp/ext" } } } }),
  );
  assert.equal(browserExtensionInstalled([profile]), true);
  assert.equal(browserExtensionInstalled([path.join(profile, "missing")]), false);
});
