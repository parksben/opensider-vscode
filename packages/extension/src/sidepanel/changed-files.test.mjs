import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outfile = path.join(root, "node_modules/.cache/changed-files.test.cjs");

buildSync({
  entryPoints: [path.join(root, "src/sidepanel/changed-files.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  alias: { "@shared": path.join(root, "shared/index.ts") },
  logLevel: "silent",
});

const {
  changedFilesOf,
  lineDiffStats,
  statsFromGitPatch,
} = createRequire(import.meta.url)(outfile);

test("whole-file Write without oldText counts every new line as additions", () => {
  const body = ["package rest", "", "func Build() {}", "func Helper() {}"].join("\n");
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "w1",
          toolName: "Write",
          kind: "edit",
          status: "completed",
          args: {
            file_path: "server/ide_core/internal/rest/builders.go",
            content: body,
          },
        },
      ],
    },
    "/repo",
  );
  assert.equal(files.length, 1);
  assert.equal(files[0]?.relativePath, "server/ide_core/internal/rest/builders.go");
  assert.equal(files[0]?.additions, 4);
  assert.equal(files[0]?.deletions, 0);
});

test("ACP diff with only newText (no oldText) counts additions", () => {
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "w1",
          toolName: "Write",
          kind: "edit",
          status: "completed",
          args: { path: "server/ide_core/internal/rest/builders.go" },
          content: [
            {
              type: "diff",
              path: "/repo/server/ide_core/internal/rest/builders.go",
              newText: "line1\nline2\nline3",
            },
          ],
        },
      ],
    },
    "/repo",
  );
  assert.equal(files[0]?.additions, 3);
  assert.equal(files[0]?.deletions, 0);
});

test("large same-length whole-file rewrite still yields non-zero stats", () => {
  const oldLines = Array.from({ length: 1500 }, (_, i) => `old ${i}`);
  const newLines = oldLines.map((line, i) => (i === 42 ? "changed line" : line));
  const stats = lineDiffStats(oldLines.join("\n"), newLines.join("\n"));
  assert.ok(stats);
  assert.ok((stats.additions ?? 0) + (stats.deletions ?? 0) > 0, "same-length rewrite must not collapse to +0 -0");
  assert.equal(stats.additions, 1);
  assert.equal(stats.deletions, 1);
});

test("Codex apply_patch string args produce +/- stats", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: server/ide_core/internal/rest/builders.go",
    "@@",
    " package rest",
    "-func Old() {}",
    "+func New() {}",
    "*** End Patch",
  ].join("\n");
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "p1",
          toolName: "apply_patch",
          kind: "edit",
          status: "completed",
          args: { input: patch },
        },
      ],
    },
    "/repo",
  );
  assert.equal(files[0]?.relativePath, "server/ide_core/internal/rest/builders.go");
  assert.equal(files[0]?.additions, 1);
  assert.equal(files[0]?.deletions, 1);
});

test("several edits to one file sum their line stats", () => {
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "e1",
          toolName: "Edit",
          kind: "edit",
          status: "completed",
          args: {
            file_path: "builders.go",
            old_string: "a",
            new_string: "b",
          },
        },
        {
          type: "tool-call",
          toolCallId: "e2",
          toolName: "Edit",
          kind: "edit",
          status: "completed",
          args: {
            file_path: "builders.go",
            old_string: "x\ny",
            new_string: "z",
          },
        },
      ],
    },
    "/repo",
  );
  assert.equal(files.length, 1);
  assert.equal(files[0]?.additions, 2);
  assert.equal(files[0]?.deletions, 3);
});

test("statsFromGitPatch ignores ---/+++ headers", () => {
  const stats = statsFromGitPatch(
    ["--- a/f", "+++ b/f", "@@ -1,2 +1,2 @@", "-old", "+new", " context"].join("\n"),
  );
  assert.deepEqual(stats, { additions: 1, deletions: 1 });
});

test("execute tool whose title/path is the shell command produces no file row", () => {
  const command =
    "git stash show -p -- docs/api/frontend-api.md server/ide_core/internal/rest/builders.go";
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "x1",
          toolName: command,
          kind: "execute",
          status: "completed",
          args: { command },
          primaryArg: command,
          content: [
            {
              type: "diff",
              path: "opensider-output:/x1/git.log",
              oldText: "",
              newText: "$ " + command + "\n(output)",
            },
          ],
        },
        {
          type: "tool-call",
          toolCallId: "x2",
          toolName: "git diff 'stash@{0}^1' 'stash@{0}' -- docs/api/frontend-api.md",
          kind: "execute",
          status: "completed",
          args: {
            command: "git diff 'stash@{0}^1' 'stash@{0}' -- docs/api/frontend-api.md",
          },
          primaryArg: "git diff 'stash@{0}^1' 'stash@{0}' -- docs/api/frontend-api.md",
        },
      ],
    },
    "/repo",
  );
  assert.equal(files.length, 0);
});

test("opensider-diff URI is not listed as a changed file", () => {
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "d1",
          toolName: "Edit",
          kind: "edit",
          status: "completed",
          args: { path: "opensider-diff:/before/1/builders.go" },
          content: [
            {
              type: "diff",
              path: "opensider-diff:/after/1/builders.go",
              oldText: "a",
              newText: "b",
            },
          ],
        },
      ],
    },
    "/repo",
  );
  assert.equal(files.length, 0);
});

test("real edit still produces a files-changed row beside execute tools", () => {
  const command = "git stash show -p -- docs/api/frontend-api.md";
  const files = changedFilesOf(
    {
      id: "m1",
      role: "assistant",
      createdAt: new Date(),
      content: [
        {
          type: "tool-call",
          toolCallId: "x1",
          toolName: command,
          kind: "execute",
          status: "completed",
          args: { command },
          primaryArg: command,
        },
        {
          type: "tool-call",
          toolCallId: "e1",
          toolName: "Edit",
          kind: "edit",
          status: "completed",
          args: {
            file_path: "server/ide_core/internal/rest/builders.go",
            old_string: "old",
            new_string: "new",
          },
        },
      ],
    },
    "/repo",
  );
  assert.equal(files.length, 1);
  assert.equal(files[0]?.relativePath, "server/ide_core/internal/rest/builders.go");
  assert.equal(files[0]?.additions, 1);
  assert.equal(files[0]?.deletions, 1);
});
