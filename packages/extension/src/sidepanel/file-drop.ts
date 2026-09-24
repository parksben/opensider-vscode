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

/** The path-carrying types, most complete first. */
const PATH_DRAG_TYPES = ["application/vnd.code.uri-list", "text/uri-list"] as const;

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
 * Taking the frame back from the workbench.
 *
 * VS Code parks every webview while a drag is anywhere over its window: its
 * `WebviewWindowDragMonitor` answers a `dragover` on the workbench window by setting
 * `pointer-events: none` on our iframe, so a file dragged in across the editor is already
 * shut out by the time it reaches the panel - no `dragenter`, no overlay, no drop. Holding
 * Shift is the one exemption the monitor makes, and it takes the webview's word for it:
 * the frame host forwards `drag` reports with whatever `shiftKey` the event carried, and a
 * report with `shiftKey` set makes the monitor hand the frame back.
 *
 * So that is what this sends - a `dragover` at our own window, flagged, carrying one file
 * so the host recognises it as a file drag worth reporting. It is the only channel a
 * webview has to say "leave this frame alone", and it has to be sent on a timer because a
 * parked frame cannot see the drag that parked it. Once the frame is back and the pointer
 * is over the panel, the drag stays inside this document and nothing parks it again.
 */
const RECLAIM_FLAG = "__opensiderReclaim";

/** How often to reclaim: comfortably inside the ~350ms the drag model re-fires `dragover`. */
export const RECLAIM_MS = 200;

/** Our own reclaim bouncing back through the listeners; never a real drag. */
export function isReclaim(event: Event): boolean {
  return (event as unknown as Record<string, unknown>)[RECLAIM_FLAG] === true;
}

export function reclaimFrame(target: Window): void {
  let data: DataTransfer;
  try {
    data = new DataTransfer();
    // The frame host only reports drags whose items are all files, so an empty one is
    // ignored and the frame is never handed back.
    data.items.add(new File([], "reclaim"));
  } catch {
    return;
  }
  const event = new DragEvent("dragover", {
    bubbles: false,
    cancelable: true,
    shiftKey: true,
    dataTransfer: data,
  });
  Object.defineProperty(event, RECLAIM_FLAG, { value: true });
  target.dispatchEvent(event);
}

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
 */
export function pathsFromTypes(types: readonly string[], read: (type: string) => string): string[] {
  const seen = new Map(types.map((type) => [type.toLowerCase(), type]));
  for (const type of PATH_DRAG_TYPES) {
    const actual = seen.get(type);
    if (actual === undefined) continue;
    const paths = parseUriList(read(actual));
    // A type that is present but holds nothing usable is not a reason to stop looking.
    if (paths.length > 0) return paths;
  }
  return [];
}

function parseUriList(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    // `#` opens a comment in the uri-list format, and a non-`file:` URI has no path to give.
    if (!value || value.startsWith("#") || !/^file:/i.test(value)) continue;
    try {
      const { pathname, hostname } = new URL(value);
      const path = decodeURIComponent(pathname);
      if (path) out.push(hostname ? `//${hostname}${path}` : path);
    } catch {
      // not a usable URL; the byte path will pick the file up instead
    }
  }
  return out;
}

/** `pathsFromTypes` against a live event. Must be called while the event is being handled. */
export function pathsFromDrop(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];
  return pathsFromTypes(Array.from(dataTransfer.types ?? []), (type) => {
    try {
      return dataTransfer.getData(type) ?? "";
    } catch {
      return "";
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
