import type { ActiveFile } from "@shared";
import { File, Plus, X } from "lucide-react";
import { memo } from "react";
import { openInEditor } from "../bridge";
import { t, type Locale } from "../i18n";
import { RippleButton } from "./RippleButton";

/** Last path segment — same idea as editor-tab `name` (`uri.path.split("/").pop()`). */
export function pathLeaf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const leaf = normalized.split("/").pop();
  return leaf || path;
}

/**
 * Copilot-Chat-style ambient file chip in the attachment row.
 *
 * Default (italic + plus): the file is *not* prepended to the prompt. Clicking plus
 * includes it (normal weight + close). Clicking close only toggles inclusion off — the
 * chip stays for as long as an editor file is focused.
 */
export const ActiveFileChip = memo(function ActiveFileChip({
  locale,
  file,
  included,
  onToggle,
}: {
  locale: Locale;
  file: ActiveFile;
  included: boolean;
  onToggle: (next: boolean) => void;
}) {
  const toggleLabel = t(locale, included ? "activeFileStopSharing" : "activeFileStartSharing");
  const ToggleIcon = included ? X : Plus;
  // `relativePath` comes from `vscode.workspace.asRelativePath` (absolute when outside the workspace).
  const title = file.relativePath || file.path;
  const label = pathLeaf(title);

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--panel-2)] py-0.5 pl-1.5 pr-1 text-[11px] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
    >
      <RippleButton
        type="button"
        hoverBg={false}
        title={title}
        aria-label={label}
        onClick={() => openInEditor(file.path)}
        className="inline-flex items-center gap-1 rounded-full text-left"
      >
        <File size={12} className="shrink-0 opacity-80" aria-hidden="true" />
        <span className={`text-left ${included ? "" : "italic"}`}>{label}</span>
      </RippleButton>
      <RippleButton
        type="button"
        title={toggleLabel}
        aria-label={toggleLabel}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(!included);
        }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ToggleIcon size={12} />
      </RippleButton>
    </span>
  );
});
