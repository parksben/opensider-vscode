import { ExternalLink, LoaderCircle, SquareTerminal } from "lucide-react";
import { useEffect, useRef } from "react";
import { postExtension } from "../bridge";
import type { ToolPart } from "../chat-types";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { useTerminal } from "../terminals-context";
import { toolPrimaryArg } from "../tool-label";
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
 */
export function TerminalCard({ locale, part }: { locale: Locale; part: ToolPart }) {
  const terminal = useTerminal(part.terminalId);
  const bodyRef = useRef<HTMLPreElement>(null);
  const command = terminal?.command || toolPrimaryArg(part) || part.toolName;
  const output = terminal ? terminal.output : outputOf(part.result);
  const running = terminal
    ? terminal.running
    : part.status === "pending" || part.status === "in_progress";
  const exitCode = terminal?.exitCode;

  // Follow the tail while it runs, the way a terminal does.
  useEffect(() => {
    const node = bodyRef.current;
    if (node && running) node.scrollTop = node.scrollHeight;
  }, [output, running]);

  const openLabel = terminal ? t(locale, "openInTerminal") : t(locale, "openOutputFile");
  const open = () => {
    if (terminal) postExtension({ type: "terminal.show", terminalId: terminal.terminalId });
    else postExtension({ type: "output.open", id: part.toolCallId, command, output });
  };

  return (
    <section className="my-1 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-2)]">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="inline-flex shrink-0 text-[var(--muted)]">
          {running ? (
            <LoaderCircle size={12} className="animate-spin" />
          ) : (
            <SquareTerminal size={12} strokeWidth={1.75} />
          )}
        </span>
        <code
          title={command}
          className="min-w-0 flex-1 truncate font-[var(--vscode-editor-font-family)] text-[11.5px] text-[var(--text)]"
        >
          {command}
        </code>
        {!running && exitCode != null ? (
          <span
            className={`shrink-0 text-[10.5px] ${exitCode === 0 ? "text-[var(--muted)]" : "text-[var(--bad)]"}`}
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
      {output ? (
        <pre
          ref={bodyRef}
          className="cs-fold-scroll overflow-auto whitespace-pre-wrap break-words border-t border-[var(--line)] px-2 py-1.5 font-[var(--vscode-editor-font-family)] text-[11px] leading-relaxed text-[var(--muted)]"
        >
          {output}
        </pre>
      ) : null}
    </section>
  );
}
