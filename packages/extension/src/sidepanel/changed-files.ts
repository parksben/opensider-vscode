import type { ChangedFile } from "@shared";
import type { ChatMessage, ToolPart } from "./chat-types";

/**
 * The files an assistant turn wrote, derived from its own tool calls.
 *
 * Nothing extra is asked of the agent: a completed write/edit/delete tool call already
 * carries the path it touched. The same read/write split as the permission gate
 * (`isWorkspaceWritePermission`) decides what counts as a write.
 */

const DELETE_RE = /\b(delete|remove|rm|unlink)\b/;
const CREATE_RE = /\b(create|new_file|add_file|write_file|touch)\b/;
const WRITE_RE = /\b(edit|write|delete|move|rename|create|patch|apply|multiedit|notebook)\b/;
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
  return "";
}

function changeKind(haystack: string): ChangedFile["change"] {
  if (DELETE_RE.test(haystack)) return "deleted";
  if (CREATE_RE.test(haystack)) return "created";
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

/**
 * Collects the workspace files one assistant message changed, newest last and deduped by
 * path. `cwd` keeps the display relative and drops anything written outside the workspace.
 */
export function changedFilesOf(message: ChatMessage, cwd: string): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const part of message.content) {
    if (part.type !== "tool-call") continue;
    if (part.status !== "completed") continue;
    if (!isWriteTool(part)) continue;
    const path = normalize(pathFromArgs(part.args) || part.primaryArg || "");
    if (!path) continue;
    const absolute = path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
    if (absolute && cwd && !path.startsWith(cwd)) continue;
    const relativePath = absolute && cwd ? path.slice(cwd.length).replace(/^[\\/]/, "") : path;
    if (!relativePath) continue;
    byPath.set(relativePath, {
      path: absolute ? path : cwd ? `${cwd}/${relativePath}` : relativePath,
      relativePath,
      change: changeKind(`${part.kind ?? ""} ${part.toolName ?? ""}`.toLowerCase()),
    });
  }
  return [...byPath.values()];
}
