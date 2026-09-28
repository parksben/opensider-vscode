import type { Locale } from "../i18n";
import { t } from "../i18n";
import { extensionUpdatePrompt } from "../update-prompt";
import { PromptDialog } from "./PromptDialog";

/**
 * Shown when a GitHub Release is newer than this install. The extension does not
 * download anything itself — the user hands the prompt to their own agent.
 */
export function UpdateDialog({
  locale,
  versions,
  onClose,
}: {
  locale: Locale;
  versions: { extension: string; host?: string; latest?: string };
  onClose: () => void;
}) {
  const label = (key: Parameters<typeof t>[1]) => t(locale, key);
  const unknown = label("versionUnknown");
  const rows: Array<[string, string]> = [
    [label("versionExtension"), versions.extension || unknown],
    [label("versionHost"), versions.host || unknown],
    [label("versionLatest"), versions.latest || unknown],
  ];

  return (
    <PromptDialog
      locale={locale}
      title={label("updateDialogTitle")}
      hint={label("updateDialogHint")}
      prompt={extensionUpdatePrompt(locale)}
      copyLabel={label("copyUpdatePrompt")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1">
        {rows.map(([name, value]) => (
          <span key={name} className="flex items-center gap-2 text-[12px]">
            <span className="shrink-0 text-[var(--muted)]">{name}</span>
            <span className="min-w-0 flex-1 truncate text-right text-[var(--text)]">{value}</span>
          </span>
        ))}
      </div>
    </PromptDialog>
  );
}
