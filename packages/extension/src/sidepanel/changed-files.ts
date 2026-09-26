import type { ChangedFile } from "@shared";
import type { ChatMessage, ToolPart } from "./chat-types";

/**
 * The files an assistant turn wrote, derived from its own tool calls.
 *
 * Nothing extra is asked of the agent: a completed write/edit/delete tool call already
 * carries the path it touched. The same read/write split as the permission gate
 * (`isWorkspaceWritePermission`) decides what counts as a write.
 *
 * When the call also carries an ACP diff (or edit args with before/after text), the
 * row gets line +/- counts and snapshots so the panel can open a per-change diff.
 */

const DELETE_RE = /\b(delete|remove|rm|unlink)\b/;
const CREATE_RE = /\b(create|new_file|add_file|write_file|touch)\b/;
const WRITE_RE = /\b(edit|write|delete|move|rename|create|patch|apply|multiedit|notebook|strreplace|search_replace)\b/;
const READ_RE = /\b(execute|shell|bash|terminal|command|fetch|http|network|search|grep|glob|list|read|view)\b/;

const PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "file",
  "target_file",
  "targetFile",
  "abs_path",
  "absolute_path",
  "uri",
  "filename",
  "new_path",
  "newPath",
];

const OLD_TEXT_KEYS = ["old_string", "oldString", "old_str", "before", "oldText", "old_text"];
const NEW_TEXT_KEYS = [
  "new_string",
  "newString",
  "new_str",
  "after",
  "newText",
  "new_text",
  "contents",
  "content",
  "new_contents",
  "file_text",
  "fileText",
  "code",
  "text",
  "updated_file",
];
const PATCH_TEXT_KEYS = ["patch", "diff", "apply_patch", "applyPatch", "input"];

type DiffSnapshot = {
  path?: string;
  oldText?: string | null;
  newText?: string | null;
  additions?: number;
  deletions?: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Digs the first path-looking string out of a tool's arguments. */
function pathFromArgs(args: unknown): string {
  const record = asRecord(args);
  if (!record) return typeof args === "string" ? args.trim() : "";
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  // ACP tool calls often carry `locations: [{ path }]` instead of a flat argument.
  const locations = record.locations;
  if (Array.isArray(locations)) {
    for (const item of locations) {
      const nested = asRecord(item);
      const value = nested ? pathFromArgs(nested) : "";
      if (value) return value;
    }
  }
  for (const key of PATCH_TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      const fromPatch = pathFromPatchText(value);
      if (fromPatch) return fromPatch;
    }
  }
  return "";
}

function pathFromPatchText(text: string): string {
  for (const line of text.split("\n")) {
    const codex = line.match(/^\*\*\* (?:Update|Add|Delete) File:\s*(.+?)\s*$/);
    if (codex?.[1]) return codex[1].trim();
    const git = line.match(/^\+\+\+\s+(?:b\/)?(.+?)\s*$/);
    if (git?.[1] && git[1] !== "/dev/null") return git[1].trim();
  }
  return "";
}

function changeKind(haystack: string): ChangedFile["change"] {
  if (DELETE_RE.test(haystack)) return "deleted";
  if (CREATE_RE.test(haystack)) return "created";
  return "modified";
}

function preferChange(a: ChangedFile["change"], b: ChangedFile["change"]): ChangedFile["change"] {
  if (a === "deleted" || b === "deleted") return a === "created" || b === "created" ? "modified" : "deleted";
  if (a === "created" || b === "created") return "created";
  return "modified";
}

/** True when this tool call wrote to the workspace rather than just reading it. */
export function isWriteTool(part: ToolPart): boolean {
  const hay = `${part.kind ?? ""} ${part.toolName ?? ""}`.toLowerCase();
  if (READ_RE.test(hay) && !WRITE_RE.test(hay)) return false;
  return WRITE_RE.test(hay);
}

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname);
    } catch {
      return "";
    }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return "";
  return trimmed;
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

/** Multiset line overlap — O(n), used when full LCS is too expensive. */
function bagLineStats(a: string[], b: string[]): { additions: number; deletions: number } {
  const avail = new Map<string, number>();
  for (const line of a) avail.set(line, (avail.get(line) ?? 0) + 1);
  let common = 0;
  for (const line of b) {
    const n = avail.get(line) ?? 0;
    if (n > 0) {
      avail.set(line, n - 1);
      common += 1;
    }
  }
  return { additions: b.length - common, deletions: a.length - common };
}

/**
 * Line additions / deletions via LCS length — the same totals a unified diff's
 * hunk headers would report for a whole-file replace.
 */
export function lineDiffStats(
  oldText: string | null | undefined,
  newText: string | null | undefined,
): { additions: number; deletions: number } | undefined {
  if (oldText === undefined && newText === undefined) return undefined;
  const a = splitLines(oldText ?? "");
  const b = splitLines(newText ?? "");
  if (a.length === 0 && b.length === 0) return { additions: 0, deletions: 0 };
  if (a.length === 0) return { additions: b.length, deletions: 0 };
  if (b.length === 0) return { additions: 0, deletions: a.length };

  // Cap DP cost for huge files. Net line-count delta hides same-length rewrites
  // (the builders.go case), so fall back to multiset overlap instead.
  if (a.length > 4000 || b.length > 4000 || a.length * b.length > 1_500_000) {
    return bagLineStats(a, b);
  }

  const prev = new Array<number>(b.length + 1).fill(0);
  const cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  const lcs = prev[b.length];
  return { additions: b.length - lcs, deletions: a.length - lcs };
}

/** Counts +/- lines in a git / Codex-style patch (skips `---` / `+++` headers). */
export function statsFromGitPatch(text: string): { additions: number; deletions: number } | undefined {
  let additions = 0;
  let deletions = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  if (additions === 0 && deletions === 0) return undefined;
  return { additions, deletions };
}

function looksLikePatch(text: string): boolean {
  return (
    /^diff --git /m.test(text) ||
    /^\*\*\* Begin Patch/m.test(text) ||
    /^\*\*\* (?:Update|Add|Delete) File:/m.test(text) ||
    /^@@ /m.test(text) ||
    (/^(\+\+\+|---) /m.test(text) && (/^\+/m.test(text) || /^-/m.test(text)))
  );
}

function textField(record: Record<string, unknown>, keys: string[]): string | null | undefined {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (value === null) return null;
    if (typeof value === "string") return value;
  }
  return undefined;
}

function patchTextFrom(record: Record<string, unknown>): string | undefined {
  if (typeof record.patch === "string" && record.patch) return record.patch;
  const patch = asRecord(record.patch);
  if (patch && typeof patch.text === "string") return patch.text;
  if (typeof record.diff === "string" && record.diff) return record.diff;
  return undefined;
}

function snapshotFromDiffItem(record: Record<string, unknown>): DiffSnapshot | undefined {
  const patchText = patchTextFrom(record);
  const isDiffType = record.type === "diff" || record.type === "file" || record.type === "resource";
  if (
    !isDiffType &&
    record.oldText === undefined &&
    record.newText === undefined &&
    record.old_text === undefined &&
    record.new_text === undefined &&
    !patchText
  ) {
    return undefined;
  }

  let path = typeof record.path === "string" ? record.path : undefined;
  if (!path && typeof record.uri === "string") path = record.uri;

  // `{ type: "resource", resource: { uri, text } }`
  const resource = asRecord(record.resource);
  if (resource) {
    if (!path && typeof resource.uri === "string") path = resource.uri;
  }

  const oldText = textField(record, ["oldText", "old_text"]);
  let newText = textField(record, ["newText", "new_text", "text", "contents", "content"]);
  if (newText === undefined && resource && typeof resource.text === "string") newText = resource.text;

  let additions: number | undefined;
  let deletions: number | undefined;
  if (patchText) {
    const fromPatch = statsFromGitPatch(patchText);
    if (fromPatch) {
      additions = fromPatch.additions;
      deletions = fromPatch.deletions;
    }
    if (!path) path = pathFromPatchText(patchText) || undefined;
  }

  // v2 diffs may list paths under `changes` without old/new text.
  if (!path && Array.isArray(record.changes)) {
    for (const change of record.changes) {
      const nested = asRecord(change);
      if (nested && typeof nested.path === "string" && nested.path.trim()) {
        return {
          path: nested.path,
          oldText,
          newText,
          additions,
          deletions,
        };
      }
    }
  }

  if (path === undefined && oldText === undefined && newText === undefined && additions === undefined) {
    return undefined;
  }
  return { path, oldText, newText, additions, deletions };
}

function collectContentItems(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/** ACP content blocks, plus any diff-shaped payload still stuck on `result`. */
function diffsFromPart(part: ToolPart): DiffSnapshot[] {
  const out: DiffSnapshot[] = [];
  for (const item of [...collectContentItems(part.content), ...collectContentItems(part.result)]) {
    const record = asRecord(item);
    if (!record) {
      if (typeof item === "string" && looksLikePatch(item)) {
        const stats = statsFromGitPatch(item);
        if (stats) out.push({ path: pathFromPatchText(item) || undefined, ...stats });
      }
      continue;
    }
    // Nested `{ type: "content", content: { type: "diff", ... } }` wrappers.
    if (record.type === "content") {
      const inner = asRecord(record.content);
      if (inner) {
        const snap = snapshotFromDiffItem(inner);
        if (snap) out.push(snap);
      } else if (typeof record.content === "string" && looksLikePatch(record.content)) {
        const stats = statsFromGitPatch(record.content);
        if (stats) out.push({ path: pathFromPatchText(record.content) || undefined, ...stats });
      }
      continue;
    }
    const snap = snapshotFromDiffItem(record);
    if (snap) out.push(snap);
  }
  return out;
}

function sumStats(edits: DiffSnapshot[]): DiffSnapshot | undefined {
  let additions = 0;
  let deletions = 0;
  let any = false;
  let oldText: string | null | undefined;
  let newText: string | null | undefined;
  let path: string | undefined;
  for (const edit of edits) {
    if (edit.additions != null || edit.deletions != null) {
      additions += edit.additions ?? 0;
      deletions += edit.deletions ?? 0;
      any = true;
    } else if (edit.oldText !== undefined || edit.newText !== undefined) {
      const computed = lineDiffStats(edit.oldText ?? "", edit.newText ?? "");
      if (computed) {
        additions += computed.additions;
        deletions += computed.deletions;
        any = true;
      }
    }
    if (!path && edit.path?.trim()) path = edit.path.trim();
    if (oldText === undefined && edit.oldText !== undefined) oldText = edit.oldText;
    if (edit.newText !== undefined) newText = edit.newText;
  }
  if (!any && oldText === undefined && newText === undefined) return undefined;
  return {
    path,
    oldText,
    newText,
    additions: any ? additions : undefined,
    deletions: any ? deletions : undefined,
  };
}

/** Edit/write tool args when the agent did not attach an ACP diff block. */
function diffFromArgs(args: unknown, change: ChangedFile["change"]): DiffSnapshot | undefined {
  const record = asRecord(args);
  if (!record) {
    if (typeof args === "string" && looksLikePatch(args)) {
      const stats = statsFromGitPatch(args);
      if (!stats) return undefined;
      return { path: pathFromPatchText(args) || undefined, ...stats };
    }
    return undefined;
  }

  // Claude Code MultiEdit / Cursor multi_replace: `{ edits: [{ old_string, new_string }, ...] }`.
  if (Array.isArray(record.edits) && record.edits.length > 0) {
    const nested: DiffSnapshot[] = [];
    for (const edit of record.edits) {
      const snap = diffFromArgs(edit, change);
      if (snap) nested.push(snap);
    }
    const summed = sumStats(nested);
    if (summed) {
      const path = pathFromArgs(record);
      return path ? { ...summed, path } : summed;
    }
  }

  const oldText = textField(record, OLD_TEXT_KEYS);
  const newText = textField(record, NEW_TEXT_KEYS);

  const hasOldKey = OLD_TEXT_KEYS.some((k) => k in record);
  const hasNewKey = NEW_TEXT_KEYS.some((k) => k in record && (typeof record[k] === "string" || record[k] === null));

  if (hasOldKey || hasNewKey) {
    return {
      path: pathFromArgs(record) || undefined,
      // Whole-file write/overwrite with no before-text: every new line is an addition.
      oldText: hasOldKey ? oldText : hasNewKey ? "" : undefined,
      newText: hasNewKey ? newText : undefined,
    };
  }

  for (const key of PATCH_TEXT_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim() || !looksLikePatch(value)) continue;
    const stats = statsFromGitPatch(value);
    if (!stats) continue;
    return { path: pathFromArgs(record) || pathFromPatchText(value) || undefined, ...stats };
  }

  return undefined;
}

function pathFromDiffs(diffs: DiffSnapshot[]): string {
  for (const diff of diffs) {
    if (diff.path?.trim()) return diff.path.trim();
  }
  return "";
}

function mergeSnapshot(
  change: ChangedFile["change"],
  diffs: DiffSnapshot[],
  argsSnap: DiffSnapshot | undefined,
): Pick<ChangedFile, "additions" | "deletions" | "oldText" | "newText"> {
  let oldText: string | null | undefined;
  let newText: string | null | undefined;
  let additions: number | undefined;
  let deletions: number | undefined;

  // Sum patch stats when several content items touch the same call.
  let patchAdds = 0;
  let patchDels = 0;
  let sawPatchStats = false;
  for (const diff of diffs) {
    if (oldText === undefined && diff.oldText !== undefined) oldText = diff.oldText;
    if (diff.newText !== undefined) newText = diff.newText;
    if (diff.additions !== undefined || diff.deletions !== undefined) {
      patchAdds += diff.additions ?? 0;
      patchDels += diff.deletions ?? 0;
      sawPatchStats = true;
    }
  }
  if (sawPatchStats) {
    additions = patchAdds;
    deletions = patchDels;
  }

  if (argsSnap) {
    if (oldText === undefined && argsSnap.oldText !== undefined) oldText = argsSnap.oldText;
    if (newText === undefined && argsSnap.newText !== undefined) newText = argsSnap.newText;
    if (argsSnap.additions !== undefined || argsSnap.deletions !== undefined) {
      additions = (additions ?? 0) + (argsSnap.additions ?? 0);
      deletions = (deletions ?? 0) + (argsSnap.deletions ?? 0);
    }
  }

  if (change === "created" && oldText === undefined) oldText = null;
  if (change === "deleted" && newText === undefined) newText = null;
  // Whole-file overwrite reported with only newText (ACP Write, no oldText key).
  if (oldText === undefined && newText !== undefined && newText !== null) oldText = "";

  if (additions === undefined || deletions === undefined) {
    const computed = lineDiffStats(oldText, newText);
    if (computed) {
      additions = additions ?? computed.additions;
      deletions = deletions ?? computed.deletions;
    }
  }

  const out: Pick<ChangedFile, "additions" | "deletions" | "oldText" | "newText"> = {};
  if (oldText !== undefined) out.oldText = oldText;
  if (newText !== undefined) out.newText = newText;
  // Omit rather than showing +0 -0 when we could not measure a real change.
  if (additions !== undefined && deletions !== undefined && (additions > 0 || deletions > 0)) {
    out.additions = additions;
    out.deletions = deletions;
  }
  return out;
}

function mergeFileRow(prev: ChangedFile, next: ChangedFile): ChangedFile {
  const additions =
    prev.additions != null || next.additions != null ? (prev.additions ?? 0) + (next.additions ?? 0) : undefined;
  const deletions =
    prev.deletions != null || next.deletions != null ? (prev.deletions ?? 0) + (next.deletions ?? 0) : undefined;
  const out: ChangedFile = {
    path: next.path || prev.path,
    relativePath: prev.relativePath,
    change: preferChange(prev.change, next.change),
    oldText: prev.oldText !== undefined ? prev.oldText : next.oldText,
    newText: next.newText !== undefined ? next.newText : prev.newText,
  };
  if (additions !== undefined && deletions !== undefined && (additions > 0 || deletions > 0)) {
    out.additions = additions;
    out.deletions = deletions;
  }
  return out;
}

/**
 * Collects the workspace files one assistant message changed, newest last and deduped by
 * path. `cwd` keeps the display relative and drops anything written outside the workspace.
 * Several edits to the same path sum their line stats.
 */
export function changedFilesOf(message: ChatMessage, cwd: string): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.status !== "completed") continue;
    if (!isWriteTool(part)) continue;

    const diffs = diffsFromPart(part);
    const change = changeKind(`${part.kind ?? ""} ${part.toolName ?? ""}`.toLowerCase());
    const argsSnap = diffFromArgs(part.args, change);
    const path = normalize(pathFromArgs(part.args) || part.primaryArg || pathFromDiffs(diffs) || argsSnap?.path || "");
    if (!path) continue;
    const absolute = path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
    if (absolute && cwd && !path.startsWith(cwd)) continue;
    const relativePath = absolute && cwd ? path.slice(cwd.length).replace(/^[\\/]/, "") : path;
    if (!relativePath) continue;

    const snap = mergeSnapshot(change, diffs, argsSnap);
    const row: ChangedFile = {
      path: absolute ? path : cwd ? `${cwd}/${relativePath}` : relativePath,
      relativePath,
      change,
      ...snap,
    };
    const prev = byPath.get(relativePath);
    byPath.set(relativePath, prev ? mergeFileRow(prev, row) : row);
  }
  return [...byPath.values()];
}
