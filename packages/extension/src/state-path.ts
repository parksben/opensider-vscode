import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Absolute path of this workspace's chat state. Matches `paths.WorkspaceUIStatePath`
 * in the host: `~/.opensider-vscode/workspaces/<slug>-<sha256[:12]>/ui-state.json`.
 */
export function workspaceStatePath(key: string, name: string, home = homedir()): string {
  const bucket = bucketName(key, name);
  if (!bucket) return "";
  return path.join(home, ".opensider-vscode", "workspaces", bucket, "ui-state.json");
}

function bucketName(key: string, name: string): string {
  const cleaned = path.normalize(key.trim());
  if (!cleaned || cleaned === ".") return "";
  const hashed = process.platform === "darwin" || process.platform === "win32" ? cleaned.toLowerCase() : cleaned;
  const digest = createHash("sha256").update(hashed).digest("hex").slice(0, 12);
  const label = name.trim() || path.basename(cleaned);
  return `${slug(label)}-${digest}`;
}

function slug(label: string): string {
  let out = "";
  let lastDash = true;
  for (const char of label) {
    if (/[A-Za-z0-9]/.test(char)) {
      out += char;
      lastDash = false;
    } else if (!lastDash) {
      out += "-";
      lastDash = true;
    }
    if (out.length >= 40) break;
  }
  out = out.replace(/^-+|-+$/g, "");
  return out || "workspace";
}
