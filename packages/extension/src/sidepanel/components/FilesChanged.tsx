import type { ChangedFile } from "@shared";
import { ChevronDown, ChevronRight, FilePen, FilePlus, FileX } from "lucide-react";
import { useState } from "react";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { RippleButton } from "./RippleButton";

function changeIcon(change: ChangedFile["change"]) {
  if (change === "created") return FilePlus;
  if (change === "deleted") return FileX;
  return FilePen;
}

function DiffStats({ additions, deletions }: { additions?: number; deletions?: number }) {
  const showAdd = additions != null && additions > 0;
  const showDel = deletions != null && deletions > 0;
  if (!showAdd && !showDel) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
      {showAdd ? (
        <span className="text-[var(--vscode-gitDecoration-addedResourceForeground,var(--muted))]">
          +{additions}
        </span>
      ) : null}
      {showDel ? (
        <span className="text-[var(--vscode-gitDecoration-deletedResourceForeground,var(--muted))]">
          -{deletions}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The files this turn wrote, the way Copilot Chat shows them: one collapsible block under
 * the answer. Each row opens a per-change diff (before → after for that tool call).
 */
export function FilesChanged({
  locale,
  files,
  onOpen,
}: {
  locale: Locale;
  files: ChangedFile[];
  onOpen: (file: ChangedFile) => void;
}) {
  const [open, setOpen] = useState(true);
  if (files.length === 0) return null;

  const title = t(locale, "filesChanged").replace("{count}", String(files.length));

  return (
    <section className="mb-2 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-2)]">
      <RippleButton
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">{title}</span>
        {open ? (
          <ChevronDown size={13} className="shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-[var(--muted)]" />
        )}
      </RippleButton>
      {open ? (
        <ul className="border-t border-[var(--line)]">
          {files.map((file) => {
            const Icon = changeIcon(file.change);
            const gone = file.change === "deleted";
            return (
              <li key={`${file.change}:${file.relativePath}`}>
                <RippleButton
                  title={file.relativePath}
                  onClick={() => onOpen(file)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
                    gone ? "text-[var(--muted)] line-through" : "text-[var(--text)]"
                  }`}
                >
                  <Icon size={12} className="shrink-0 text-[var(--muted)]" />
                  <span className="min-w-0 flex-1 truncate">{file.relativePath}</span>
                  <DiffStats additions={file.additions} deletions={file.deletions} />
                </RippleButton>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
