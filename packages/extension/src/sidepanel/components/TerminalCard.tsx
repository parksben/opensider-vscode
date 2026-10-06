import { ChevronDown, ChevronRight, ExternalLink, LoaderCircle, SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { postExtension } from "../bridge";
import type { ToolPart } from "../chat-types";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { paneFollowsBottom } from "./pane-follow";
import { useTerminal } from "../terminals-context";
import { toolPrimaryArg } from "../tool-label";
import { toolFinished } from "../tool-status";
import { IconButton } from "./IconButton";

/** Pulls the printable output out of whatever the agent put in the tool result. */
function outputOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(outputOf).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["output", "stdout", "text", "content", "result"]) {
      const found = record[key];
      if (found != null) return outputOf(found);
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * One shell command: what ran, and what it is printing.
 *
 * Two sources feed this. When the agent uses ACP terminals the extension owns a real VS
 * Code terminal and pushes `terminal.state`, so output scrolls as it arrives and the button
 * reveals that terminal. When the agent runs the command itself we only have the tool
 * call's own result, and the button opens a read-only editor tab instead. The card looks
 * the same either way.
 *
 * `live` is the *turn's* running state, not this command's: a command that finished a few
 * steps ago has to stay open, otherwise the transcript collapses under the user while the
 * agent is still working. When the turn ends the card folds back to its header line, the
 * same place every other step in the process lands.
 */
export function TerminalCard({
  locale,
  part,
  live,
  superseded,
}: {
  locale: Locale;
  part: ToolPart;
  live?: boolean;
  /** A later tool call was announced after this one, so it has returned. */
  superseded?: boolean;
}) {
  const terminal = useTerminal(part.terminalId);
  const bodyRef = useRef<HTMLPreElement>(null);
  const command = terminal?.command || toolPrimaryArg(part) || part.toolName;
  const output = terminal ? terminal.output : outputOf(part.result);
  // `terminal.running` comes from a real VS Code terminal, so it is exact. Without one we
  // are down to the tool call itself, and there neither `status` nor `rawOutput` can be
  // trusted: a command that printed nothing has neither. A later tool call having been
  // announced is the signal that settles it (ACP runs them one at a time).
  const running = terminal
    ? terminal.running
    : !toolFinished(part) && !superseded;
  const exitCode = terminal?.exitCode;
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!live) setPinned(false);
  }, [live]);

  // While the turn runs the card is only ever rendered while it is the running step (the
  // live branch drops it the moment it finishes); it stays expanded so the output is
  // visible. After the turn it folds back to its header line unless the user opened it.
  const expanded = Boolean(live) || pinned;

  // Follow the tail while it runs, the way a terminal does — but only while the user has
  // not scrolled up to read what already went past. The verdict is recomputed on scroll by
  // the handler below, so any scroll up releases the follow and only a return to the exact
  // bottom picks it up again (transient output arrives every few hundred ms; a wider band
  // would drag the reader back down mid-read).
  const following = useRef(true);
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    following.current = paneFollowsBottom(node.scrollHeight, node.clientHeight, node.scrollTop);
  }, [output]);
  useEffect(() => {
    const node = bodyRef.current;
    if (!node || !running || !following.current) return;
    node.scrollTop = node.scrollHeight;
  }, [output, running]);

  const onScroll = () => {
    const node = bodyRef.current;
    if (node) {
      following.current = paneFollowsBottom(node.scrollHeight, node.clientHeight, node.scrollTop);
    }
  };

  const openLabel = terminal ? t(locale, "openInTerminal") : t(locale, "openOutputFile");
  const open = () => {
    if (terminal) postExtension({ type: "terminal.show", terminalId: terminal.terminalId });
    else postExtension({ type: "output.open", id: part.toolCallId, command, output });
  };

  return (
    <section className="group/terminal my-1 overflow-hidden border border-[var(--line)]">
      <div className="flex items-start gap-1.5 px-2 py-1.5">
        <span className="inline-flex h-6 w-3 shrink-0 items-center justify-center text-[var(--muted)]">
          {running ? (
            <LoaderCircle size={12} className="animate-spin" />
          ) : (
            <SquareTerminal size={12} strokeWidth={1.75} />
          )}
        </span>
        <button
          type="button"
          onClick={() => setPinned((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          {expanded ? (
            <ChevronDown size={12} className="shrink-0 text-[var(--muted)]" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-[var(--muted)] opacity-0 transition-opacity group-hover/terminal:opacity-100" />
          )}
          <code className="cs-terminal-command max-h-[5lh] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words font-[var(--vscode-editor-font-family)] text-[11.5px] leading-6 text-[var(--text)]">
            {command}
          </code>
        </button>
        {!running && exitCode != null ? (
          <span
            className={`inline-flex h-6 shrink-0 items-center text-[10.5px] ${exitCode === 0 ? "text-[var(--muted)]" : "text-[var(--bad)]"}`}
          >
            {t(locale, "commandExit").replace("{code}", String(exitCode))}
          </span>
        ) : null}
        <IconButton
          side="top"
          label={openLabel}
          onClick={open}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--muted)]"
        >
          <ExternalLink size={12} />
        </IconButton>
      </div>
      {output && expanded ? (
        <pre
          ref={bodyRef}
          onScroll={onScroll}
          className="cs-fold-scroll overflow-auto whitespace-pre-wrap break-words border-t border-[var(--line)] px-2 py-1.5 font-[var(--vscode-editor-font-family)] text-[11px] leading-relaxed text-[var(--muted)]"
        >
          {output}
        </pre>
      ) : null}
    </section>
  );
}
