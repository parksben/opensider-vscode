/**
 * Dropped files -> attachments.
 *
 * The side panel can receive files dropped anywhere on it. The webview gets `File`
 * objects only — no local path — so the bytes have to be sent to the extension host, which
 * writes a copy into `~/.opensider-vscode/uploads` and hands back the attachment path.
 * That is the same route pasted screenshots take.
 *
 * Everything that needs the DOM lives here next to the pure helpers; the helpers are what
 * the unit tests exercise (the module imports no globals at load time).
 */

/**
 * No size cap: the extension host writes dropped bytes to disk itself, so nothing has to
 * squeeze through the agent's stdio frames.
 */
/** Enough for a small project folder, small enough to stay quick. */
export const MAX_DROP_FILES = 100;
/** How long a single `entry.file()` may take before we treat the entry as unreadable. */
export const ENTRY_FILE_TIMEOUT_MS = 3_000;

/**
 * Types that mean "this drag is carrying files".
 *
 * `Files` is what a drag out of Finder looks like. The rest are what VS Code puts on a
 * drag out of its own explorer or off an editor tab: those carry real paths and no bytes,
 * and `Files` is not among them.
 */
const FILE_DRAG_TYPES = [
  "files",
  "text/uri-list",
  // VS Code's own list: unlike `text/uri-list` it holds every dragged resource, not just
  // the first one.
  "application/vnd.code.uri-list",
  "resourceurls",
  "codefiles",
] as const;

/**
 * Path-carrying flavours, richest first.
 *
 * - `application/vnd.code.uri-list` — every dragged resource (files and folders).
 * - `text/uri-list` — first resource only (HTML DnD convention).
 * - `ResourceURLs` — JSON URI array; explorer omits directories from this one.
 * - `CodeFiles` — JSON of absolute filesystem paths, including folders.
 *
 * Matched lowercased: the type list reports VS Code's own names that way.
 */
const PATH_URI_LIST_TYPES = ["application/vnd.code.uri-list", "text/uri-list"] as const;
const PATH_JSON_URI_TYPES = ["resourceurls"] as const;
const PATH_JSON_PATH_TYPES = ["codefiles"] as const;

/**
 * Compared lowercased: `DataTransfer.types` reports `Files` with a capital F but hands back
 * VS Code's own formats (`resourceurls`, `codefiles`) already lowercased, so matching on
 * the spelling either side happens to use is a trap.
 */
export function dragCarriesFiles(types: readonly string[]): boolean {
  const seen = types.map((type) => type.toLowerCase());
  return FILE_DRAG_TYPES.some((type) => seen.includes(type));
}

/**
 * Whether the panel is showing its "drop here" overlay, and when that claim goes stale.
 *
 * There is deliberately no enter/leave depth counter. `dragenter` and `dragleave` fire once
 * per element boundary the pointer crosses, so a counter drifts the moment one of them is
 * missed - and in a webview they *are* missed, because the workbench can cut the frame off
 * mid-drag. A drag that is still over the panel keeps saying so (the HTML drag model fires
 * `dragover` about every 350ms even while the pointer is still), so the overlay can simply
 * expire unless something renews it. Nothing can latch: the worst case is that it lingers
 * for one deadline after a drag ends somewhere we never hear about.
 */
export type DragOverlay = {
  visible: boolean;
  /** Timestamp after which an unrenewed claim is dropped. */
  until: number;
};

export const NO_DRAG: DragOverlay = { visible: false, until: 0 };

/**
 * Twice the 350ms the drag model uses to re-fire `dragover` on a stationary pointer, so a
 * held-still drag never blinks, plus room for a slow frame.
 */
export const DRAG_IDLE_MS = 800;

export type DragSignal =
  /** A `dragenter`/`dragover` carrying files: the drag is over us right now. */
  | { kind: "over"; at: number }
  /** The drag is definitively finished here: dropped, cancelled, or the panel lost focus. */
  | { kind: "exit" }
  /** The watchdog: retires a claim nothing renewed. */
  | { kind: "tick"; at: number };

export function nextDragOverlay(state: DragOverlay, signal: DragSignal): DragOverlay {
  if (signal.kind === "exit") return NO_DRAG;
  if (signal.kind === "over") return { visible: true, until: signal.at + DRAG_IDLE_MS };
  if (!state.visible) return state;
  return signal.at >= state.until ? NO_DRAG : state;
}

/**
 * Finder path (kind === "file"): let the pre-script forward.
 *
 * Workbench `Une` parks the iframe on non-shift window `drag`. Pre-script posts
 * `drag` `{ shiftKey }` only for all-`file` items. For Finder:
 * 1. `preventDefault` on enter so `drag-start` is skipped.
 * 2. Force `shiftKey` so the pre-script posts `drag` `{ shiftKey: true }`.
 * 3. Only if shift cannot be forced, `stopPropagation` so a false report cannot
 *    re-park us — never stopPropagation when shift forced (blocks Finder).
 *
 * Explorer path (string MIME): pre-script never posts. Unpark is handled by
 * `webview-unpark.ts` (host `drag` `{ shiftKey: true }` only while parked).
 * Synthetic reclaim events keep empty `dataTransfer` in Electron and cannot
 * unpark explorer — do not rely on them as the primary reclaim.
 */
const RECLAIM_FLAG = "__opensiderReclaim";

/** Legacy beat interval; park-watch in `webview-unpark` is the explorer reclaim. */
export const RECLAIM_MS = 100;

export function isReclaim(event: Event): boolean {
  return (event as unknown as Record<string, unknown>)[RECLAIM_FLAG] === true;
}

/** Make the pre-script report this drag as Shift-held. Returns whether shiftKey reads true. */
export function forceShiftKey(event: DragEvent): boolean {
  if (event.shiftKey) return true;
  try {
    Object.defineProperty(event, "shiftKey", { configurable: true, get: () => true });
  } catch {
    return false;
  }
  return Boolean((event as DragEvent).shiftKey);
}

/** Synthetic File dragover for tests / optional Finder assist. Explorer needs host unpark. */
export function reclaimFrame(target: Window): void {
  let data: DataTransfer;
  try {
    data = new DataTransfer();
    data.items.add(new File([], "reclaim"));
  } catch {
    return;
  }
  const event = new DragEvent("dragover", {
    bubbles: true,
    cancelable: true,
    shiftKey: true,
    dataTransfer: data,
  });
  Object.defineProperty(event, RECLAIM_FLAG, { value: true });
  target.dispatchEvent(event);
}

/**
 * Explorer / editor URI drags (string MIME). Not Finder `Files` byte drags.
 * Used so an empty path list after drop cannot fall through as a silent no-op.
 */
export function dragCarriesExplorerPaths(types: readonly string[]): boolean {
  const seen = types.map((type) => type.toLowerCase());
  return (
    seen.includes("resourceurls") ||
    seen.includes("codefiles") ||
    seen.includes("application/vnd.code.uri-list") ||
    seen.includes("text/uri-list")
  );
}

/** Overlay idle watchdog interval. */
export const DRAG_TICK_MS = 200;

export type DroppedFile = {
  /** File name, or the path inside the dropped folder when `dir` is set. */
  name: string;
  /** Set when the file came from a dropped folder: the dropped folder's own name. */
  dir?: string;
  file: File;
};

export type DropSkips = {
  tooLarge: number;
  tooMany: number;
  /** Entries that could not hand over a file at all - the drop should say so. */
  unreadable: number;
};

export type DropPlan = {
  files: DroppedFile[];
  /** Reasons files were skipped, in the user's head-count terms. */
  skipped: DropSkips;
};

export function emptySkips(): DropSkips {
  return { tooLarge: 0, tooMany: 0, unreadable: 0 };
}

export type DroppedItem = {
  name: string;
  dir?: string;
  entry: FileSystemEntry;
  /** The same item's own file, used when the entry cannot hand one over. */
  fallback: File | null;
};

export type CapturedDrop = {
  entries: DroppedItem[];
  /** Files that arrived without a usable entry (only when no item described itself). */
  plainFiles: File[];
  skippedTooMany: number;
};

/** Base64 with chunked `String.fromCharCode`, so a big file cannot blow the argument limit. */
export function encodeBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export async function fileToBase64(file: File): Promise<string | undefined> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return encodeBase64(bytes);
}

/**
 * Paths carried by a drag out of the VS Code explorer (or a file manager).
 *
 * These files already live on disk, so they can be attached by path with no copy; a drag
 * out of Finder carries no path at all and falls through to the byte path. Pure so the
 * choice between the two can be tested without a DataTransfer: `read` is the lookup.
 *
 * Sources are unioned: `text/uri-list` alone only has the first item, `ResourceURLs` skips
 * folders, and in a webview some flavours arrive empty even though their type is listed —
 * taking every usable payload is what makes multi-select and folder drops land.
 */
export function pathsFromTypes(types: readonly string[], read: (type: string) => string): string[] {
  const seen = new Map(types.map((type) => [type.toLowerCase(), type]));
  const out: string[] = [];
  const add = (paths: string[]) => {
    for (const path of paths) {
      if (path && !out.includes(path)) out.push(path);
    }
  };

  for (const type of PATH_URI_LIST_TYPES) {
    const actual = seen.get(type);
    if (actual === undefined) continue;
    add(parseUriList(read(actual)));
  }
  for (const type of PATH_JSON_URI_TYPES) {
    const actual = seen.get(type);
    if (actual === undefined) continue;
    add(parseResourceUrls(read(actual)));
  }
  for (const type of PATH_JSON_PATH_TYPES) {
    const actual = seen.get(type);
    if (actual === undefined) continue;
    add(parseCodeFiles(read(actual)));
  }
  return out;
}

function parseUriList(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    // `#` opens a comment in the uri-list format, and a non-`file:` URI has no path to give.
    if (!value || value.startsWith("#") || !/^file:/i.test(value)) continue;
    const path = fileUrlToPath(value);
    if (path) out.push(path);
  }
  return out;
}

/** `ResourceURLs` is a JSON array of URI strings (files only — folders are filtered upstream). */
export function parseResourceUrls(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "string" || !entry) continue;
      const path = /^file:/i.test(entry) ? fileUrlToPath(entry) : "";
      if (path) out.push(path);
    }
    return out;
  } catch {
    return [];
  }
}

/** `CodeFiles` is a JSON array of absolute filesystem paths, including directories. */
export function parseCodeFiles(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  } catch {
    return [];
  }
}

function fileUrlToPath(value: string): string {
  try {
    const { pathname, hostname } = new URL(value);
    const path = decodeURIComponent(pathname);
    if (!path) return "";
    // `file:///Users/...` has an empty host; `file://localhost/...` is the same machine.
    // Anything else is a UNC share and keeps the host in the path.
    if (!hostname || hostname.toLowerCase() === "localhost") {
      // Windows file URLs arrive as `/C:/...`; strip the leading slash so `stat` works.
      return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path;
    }
    return `//${hostname}${path}`;
  } catch {
    return "";
  }
}

/**
 * `pathsFromTypes` against a live event. Must be called while the event is being handled,
 * and only on `drop` — `getData` is empty during dragover by design.
 *
 * Also reads Electron's non-standard `File.path` when the MIME payloads are empty: some
 * explorer drops list `resourceurls`/`codefiles` in `types` but hand `getData` nothing,
 * while still exposing the real path on the stub `File` objects.
 */
/** Prefer `types`, then always probe VS Code's canonical names (types can omit payloads). */
const DROP_PATH_PROBE_TYPES = [
  "application/vnd.code.uri-list",
  "text/uri-list",
  "ResourceURLs",
  "resourceurls",
  "CodeFiles",
  "codefiles",
  "text/plain",
  "text",
] as const;

export function pathsFromDrop(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];
  const listed = Array.from(dataTransfer.types ?? []);
  const probe = [...listed];
  for (const type of DROP_PATH_PROBE_TYPES) {
    if (!probe.some((t) => t.toLowerCase() === type.toLowerCase())) probe.push(type);
  }
  const fromTypes = pathsFromTypes(probe, (type) => {
    try {
      return dataTransfer.getData(type) ?? "";
    } catch {
      return "";
    }
  });
  if (fromTypes.length > 0) return fromTypes;

  // Last-chance sync reads: some hosts only fill these on drop.
  for (const fallback of ["text/uri-list", "text/plain", "text"]) {
    try {
      const raw = dataTransfer.getData(fallback);
      if (!raw) continue;
      const paths = fallback === "text/uri-list" ? parseUriList(raw) : parsePlainPathList(raw);
      if (paths.length > 0) return paths;
    } catch {
      // continue
    }
  }

  const fromFiles: string[] = [];
  for (const file of Array.from(dataTransfer.files ?? [])) {
    const path = (file as File & { path?: string }).path;
    if (typeof path === "string" && path && !fromFiles.includes(path)) fromFiles.push(path);
  }
  return fromFiles;
}

/** Newline / URI-list shaped plain text that is actually file paths or file URLs. */
function parsePlainPathList(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    if (/^file:/i.test(value)) {
      const path = fileUrlToPath(value);
      if (path) out.push(path);
      continue;
    }
    // Absolute POSIX / Windows paths only — never treat free text as a path.
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) out.push(value);
  }
  return out;
}

/**
 * Drop-time path read that also waits on `DataTransferItem.getAsString` for explorer
 * MIME payloads when synchronous `getData` is empty (common in VS Code webviews).
 * `getAsString` must be kicked off during the drop handler; the Promise may settle after.
 */
export function pathsFromDropAsync(dataTransfer: DataTransfer | null): Promise<string[]> {
  const sync = pathsFromDrop(dataTransfer);
  if (sync.length > 0 || !dataTransfer) return Promise.resolve(sync);

  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === "string");
  if (items.length === 0) return Promise.resolve(sync);

  return new Promise((resolve) => {
    const byType = new Map<string, string>();
    let pending = items.length;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const types = Array.from(byType.keys());
      const paths = pathsFromTypes(types, (type) => byType.get(type.toLowerCase()) ?? "");
      resolve(paths.length > 0 ? paths : sync);
    };
    // Bound wait: if getAsString never calls back, still settle so the drop is not silent.
    const timer = setTimeout(finish, 250);
    for (const item of items) {
      try {
        item.getAsString((value) => {
          byType.set(item.type.toLowerCase(), value ?? "");
          pending -= 1;
          if (pending <= 0) {
            clearTimeout(timer);
            finish();
          }
        });
      } catch {
        pending -= 1;
        if (pending <= 0) {
          clearTimeout(timer);
          finish();
        }
      }
    }
  });
}

/**
 * Turns a drop into a capture: every entry to walk, plus files that no entry described.
 *
 * `dataTransfer.items` is only valid during the event, so this has to be called from the
 * drop handler itself (everything async happens afterwards, on the captured entries).
 *
 * A drop is not guaranteed to give us either shape: a real drag hands over entries, but an
 * app that only offers a promised file may give us files without entries, and a permission
 * or sandbox surprise can leave `webkitGetAsEntry()` returning nothing at all. So each item
 * is asked for its file too, and whichever side answers wins.
 */
export function collectDrop(dataTransfer: DataTransfer | null): CapturedDrop {
  const items = Array.from(dataTransfer?.items ?? []);
  const entries: CapturedDrop["entries"] = [];
  const orphanFiles: File[] = [];
  let skippedTooMany = 0;

  for (const item of items) {
    if (item.kind !== "file") continue;
    const fallback = safeFile(item);
    const entry = safeEntry(item);
    if (!entry) {
      if (fallback) orphanFiles.push(fallback);
      continue;
    }
    if (entries.length >= MAX_DROP_FILES) {
      skippedTooMany += 1;
      continue;
    }
    entries.push({
      name: entry.name,
      dir: entry.isDirectory ? entry.name : undefined,
      entry,
      // Same item's own file, kept as the way out when the entry cannot be read.
      fallback: entry.isFile ? fallback : null,
    });
  }

  // `dataTransfer.files` holds the same objects as `getAsFile()`, so it is only a fallback
  // for the case where *no* item described itself - otherwise files would be attached twice.
  const plainFiles =
    entries.length === 0 && orphanFiles.length === 0 ? Array.from(dataTransfer?.files ?? []) : orphanFiles;
  return { entries, plainFiles, skippedTooMany };
}

function safeFile(item: DataTransferItem): File | null {
  try {
    return typeof item.getAsFile === "function" ? item.getAsFile() : null;
  } catch {
    return null;
  }
}

function safeEntry(item: DataTransferItem): FileSystemEntry | null {
  try {
    return typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
  } catch {
    return null;
  }
}

/**
 * `entry.file()` on a real drag: it can fail outright, and it can simply never call back
 * (a folder the user cannot read, a cloud placeholder, an entry whose backing store went
 * away). Neither may stall a drop, so the wait is bounded.
 */
export function fileFromEntry(
  entry: FileSystemFileEntry,
  timeoutMs: number = ENTRY_FILE_TIMEOUT_MS,
): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    let settled = false;
    const finish = (value: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      entry.file(
        (value) => finish(value),
        () => finish(null),
      );
    } catch {
      finish(null);
    }
  });
}

/** Reads a directory entry recursively, bounded by `MAX_DROP_FILES`. */
export async function walkEntry(
  entry: FileSystemEntry,
  dir: string | undefined,
  out: DroppedFile[],
  skipped: DropSkips,
  fallback: File | null = null,
): Promise<void> {
  if (out.length >= MAX_DROP_FILES) {
    skipped.tooMany += 1;
    return;
  }
  if (entry.isFile) {
    const file = (await fileFromEntry(entry as FileSystemFileEntry)) ?? fallback;
    if (!file) {
      skipped.unreadable += 1;
      return;
    }
    out.push({ name: entry.name, dir, file });
    return;
  }
  if (!entry.isDirectory) {
    skipped.unreadable += 1;
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await readBatch(reader);
    if (batch.length === 0) break;
    for (const child of batch) {
      await walkEntry(child, dir ?? entry.name, out, skipped);
    }
  }
}

/**
 * One `readEntries` round. Same bound as `fileFromEntry`: a folder Chrome will not list must
 * end the walk (with whatever was collected) instead of hanging the drop for good.
 */
function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise<FileSystemEntry[]>((resolve) => {
    let settled = false;
    const finish = (values: FileSystemEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(values);
    };
    const timer = setTimeout(() => finish([]), ENTRY_FILE_TIMEOUT_MS);
    try {
      reader.readEntries(
        (values) => finish(values),
        () => finish([]),
      );
    } catch {
      finish([]);
    }
  });
}
