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
      'export { buildHandoffPrompt, handoffCutoff } from "./handoff";',
      'export { workspaceStatePath } from "../state-path";',
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

const {
  buildHandoffPrompt,
  groupModelsByPrefix,
  modelShortName,
  nextThreadScroll,
  browserExtensionInstalled,
  workspaceStatePath,
} = createRequire(import.meta.url)(outfile);

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

test("handoff prompt points at the session file and stops before the next round", () => {
  const { handoffCutoff } = createRequire(import.meta.url)(outfile);
  const cut = handoffCutoff(
    [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant" },
    ],
    "a1",
  );
  assert.equal(cut.beforeRound, 2);
  assert.equal(cut.throughMessageId, "a1");
  assert.equal(cut.nextRoundMessageId, "u2");
  const prompt = buildHandoffPrompt({
    locale: "zh",
    target: "browser",
    statePath: "/tmp/ui-state.json",
    sessionId: "sess",
    ...cut,
    workspace: "/tmp/repo",
  });
  assert.match(prompt, /浏览器端 OpenSider/);
  assert.match(prompt, /\/tmp\/sessions\/sess\.json/);
  assert.match(prompt, /只看第 2 轮之前/);
  assert.match(prompt, /sess/);
  assert.doesNotMatch(prompt, /User: /);
});

test("scrolled-up reading keeps its place when the transcript grows", () => {
  assert.equal(nextThreadScroll(true, 0, -40), null);
  assert.equal(nextThreadScroll(true, -20, -40), 0);
  assert.equal(nextThreadScroll(false, -200, -40), -240);
});

test("workspace state path matches the host bucket", () => {
  const file = workspaceStatePath(
    "/Users/jyxc-dz-0100623/Desktop/projects/opensider-vscode",
    "opensider-vscode",
    "/Users/jyxc-dz-0100623",
  );
  assert.equal(
    file,
    "/Users/jyxc-dz-0100623/.opensider-vscode/workspaces/opensider-vscode-28b83ff78e19/ui-state.json",
  );
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
