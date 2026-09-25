import type { ActiveFile } from "./protocol";

/**
 * Full equality, including the caret. Used to drop pushes that would tell the panel
 * something it already knows — switching tab groups and clicking around in one file both
 * fire events that often resolve to an identical report.
 */
export function sameActiveFile(a: ActiveFile | null, b: ActiveFile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.path === b.path &&
    a.languageId === b.languageId &&
    a.dirty === b.dirty &&
    a.line === b.line &&
    a.column === b.column &&
    a.lineCount === b.lineCount &&
    a.selection?.startLine === b.selection?.startLine &&
    a.selection?.endLine === b.selection?.endLine
  );
}

/**
 * Equality of the parts the composer actually draws.
 *
 * The caret is in the report because the prompt wants it, but it is not on screen, so a
 * plain keystroke must not cost a React render of the composer. The panel keeps the full
 * report in a ref and only lifts it into state when this returns false.
 */
export function sameActiveFileDisplay(a: ActiveFile | null, b: ActiveFile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.path === b.path &&
    a.relativePath === b.relativePath &&
    a.languageId === b.languageId &&
    a.dirty === b.dirty &&
    a.selection?.startLine === b.selection?.startLine &&
    a.selection?.endLine === b.selection?.endLine
  );
}

/** The shape of a composer chip, narrowed to what the dedupe below needs. */
export type AttachedRange = {
  editorSelection?: boolean;
  relativePath?: string;
  filePath?: string;
  path?: string;
  startLine?: number;
  endLine?: number;
};

/**
 * Decides whether the ambient block is worth sending with this prompt.
 *
 * The panel owns this rather than the host because the panel is where the attachment
 * list exists: chips are flattened into the prompt body before it goes over the wire, so
 * by the time the host sees the text there is no structured range left to compare.
 *
 * Dropped when the user has already attached the exact range they are looking at —
 * that chip renders the code itself, and naming the same lines above it just says the
 * same thing twice. A different range of the same file is kept: the caret is still
 * saying something the chip does not.
 */
export function activeFileForPrompt(
  file: ActiveFile | null | undefined,
  attachments: readonly AttachedRange[],
): ActiveFile | undefined {
  if (!file) return undefined;
  const selection = file.selection;
  if (!selection) return file;
  const duplicated = attachments.some(
    (item) =>
      item.editorSelection &&
      (item.relativePath === file.relativePath || item.filePath === file.path) &&
      item.startLine === selection.startLine &&
      item.endLine === selection.endLine,
  );
  return duplicated ? undefined : file;
}

/**
 * Runs `task` at most once per `ms`, immediately on the first call and once more at the
 * end of a burst.
 *
 * Cursor movement fires continuously while the user types or holds an arrow key. The
 * leading edge keeps a tab switch feeling instant; the trailing edge is what makes the
 * burst cost one push instead of hundreds, and it is required — without it the panel
 * would keep a stale position for as long as the user keeps moving.
 */
export class Throttle {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastRun = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly ms: number,
    private readonly task: () => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  schedule(): void {
    if (this.timer) return;
    const wait = this.ms - (this.now() - this.lastRun);
    if (wait <= 0) {
      this.fire();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.fire();
    }, wait);
  }

  private fire(): void {
    this.lastRun = this.now();
    this.task();
  }

  dispose(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
