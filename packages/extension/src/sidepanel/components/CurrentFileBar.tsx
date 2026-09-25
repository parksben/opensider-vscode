import type { ActiveFile } from "@shared";
import { Eye, EyeOff, FileCode2 } from "lucide-react";
import { memo } from "react";
import { openInEditor } from "../bridge";
import { t, type Locale } from "../i18n";
import { IconButton } from "./IconButton";
import { RippleButton } from "./RippleButton";

/**
 * The strip above the composer that names the file the agent is being told about.
 *
 * This is ambient context, not an attachment, and it has to read that way: attachment
 * chips are bordered pills the user added on purpose and can remove, so this is
 * deliberately plain muted text — no pill, no border, no close button. The eye is the
 * whole affordance: it says "this is being watched" and turns it off.
 *
 * Memoised on its own props because the report behind it updates on every caret move
 * while only these fields are ever drawn.
 */
export const CurrentFileBar = memo(function CurrentFileBar({
  locale,
  file,
  enabled,
  onToggle,
}: {
  locale: Locale;
  file?: ActiveFile;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (!file) return null;

  // Leading glyph names the thing; the trailing eye is the switch, and it shows the
  // action rather than the state so the click is unambiguous.
  const ToggleIcon = enabled ? Eye : EyeOff;
  const range = file.selection
    ? file.selection.startLine === file.selection.endLine
      ? `L${file.selection.startLine}`
      : `L${file.selection.startLine}-${file.selection.endLine}`
    : "";
  const toggleLabel = t(locale, enabled ? "activeFileStopSharing" : "activeFileStartSharing");

  return (
    <div
      className={`mb-1.5 flex min-w-0 items-center gap-1 px-1 text-[11px] leading-snug text-[var(--muted)] ${
        enabled ? "" : "opacity-60"
      }`}
    >
      <FileCode2 size={12} className="shrink-0 opacity-80" aria-hidden="true" />
      <RippleButton
        type="button"
        title={`${t(locale, enabled ? "activeFileShared" : "activeFileHidden")} — ${t(locale, "activeFileOpen")}`}
        onClick={() => openInEditor(file.path, file.selection?.startLine, file.selection?.endLine)}
        className="min-w-0 flex-1 truncate rounded text-left hover:text-[var(--text)]"
      >
        <span className="truncate">{file.relativePath}</span>
        {range ? <span className="ml-1 opacity-70">{range}</span> : null}
        {file.dirty ? <span className="ml-1 opacity-70">· {t(locale, "activeFileUnsaved")}</span> : null}
      </RippleButton>
      <IconButton
        side="top"
        label={toggleLabel}
        onClick={() => onToggle(!enabled)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ToggleIcon size={12} />
      </IconButton>
    </div>
  );
});
